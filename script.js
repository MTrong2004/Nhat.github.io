// Khởi tạo các biến toàn cục
let vocabulary = []; // Mảng chứa từ vựng
let trashBin = []; // Mảng chứa thùng rác
let currentQuestion = null; // Câu hỏi hiện tại trong quiz
let isRandomized = false; // Trạng thái random câu hỏi
let isMeaningAlwaysVisible = false; // Trạng thái hiển thị nghĩa liên tục
let retryQueue = []; // Hàng đợi từ cần ôn lại
let questionsSinceLastRetry = 0; // Đếm số câu từ lần ôn lại cuối
let correctWords = new Set(); // Tập hợp các từ đã trả lời đúng
let filteredVocab = []; // Từ vựng đã lọc cho quiz

// Lấy giá trị cài đặt từ localStorage hoặc đặt mặc định
let retryInterval = localStorage.getItem('retryInterval') ? parseInt(localStorage.getItem('retryInterval'), 10) : 10;
let retryMax = localStorage.getItem('retryMax') ? parseInt(localStorage.getItem('retryMax'), 10) : 3;

// Cập nhật cài đặt khi người dùng thay đổi
document.getElementById('retry-interval').addEventListener('change', (e) => {
    retryInterval = parseInt(e.target.value, 10);
    localStorage.setItem('retryInterval', retryInterval);
});

document.getElementById('retry-max').addEventListener('change', (e) => {
    retryMax = parseInt(e.target.value, 10);
    localStorage.setItem('retryMax', retryMax);
});

// Hàm cập nhật thanh tiến độ
function updateProgressBar() {
    if (!filteredVocab || filteredVocab.length === 0) {
        document.getElementById('progress').style.width = '0%';
        document.getElementById('progress-text').textContent = '0/0';
        return;
    }
    const totalVocab = filteredVocab.length;
    const correctInFiltered = filteredVocab.filter(word => correctWords.has(word.originalIndex)).length;
    const progressPercent = totalVocab > 0 ? (correctInFiltered / totalVocab) * 100 : 0;
    document.getElementById('progress').style.width = `${progressPercent}%`;
    document.getElementById('progress-text').textContent = `${correctInFiltered}/${totalVocab}`;
}

// Tải dữ liệu khi trang được load
window.addEventListener('load', () => {
    document.getElementById('start-quiz-btn').disabled = true;
    
    if (!localStorage.getItem('vocabulary')) {
        fetch('default.xlsx')
            .then(response => response.arrayBuffer())
            .then(data => {
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                vocabulary = jsonData.map((row, index) => {
                    let romaji = row['Romaji'] || wanakana.toRomaji(row['Hiragana/Katakana']);
                    return {
                        kanji: row['Kanji'] || '',
                        hiragana: row['Hiragana/Katakana'],
                        romaji: romaji,
                        meaning: row['Nghĩa'],
                        lesson: row['Bài'].toString(),
                        originalIndex: index,
                        retryCount: 0
                    };
                });
                localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
                updateTotalVocab();
                vocabulary.forEach((word, index) => addToTable(word, 'word', index + 1));
                populateLessonButtons();
                populateLessonDropdown();
                filterVocabularyTable();
                updateSelectedVocabCount();
            });
    } else {
        vocabulary = JSON.parse(localStorage.getItem('vocabulary'));
        vocabulary.forEach(word => {
            if (!word.romaji) word.romaji = wanakana.toRomaji(word.hiragana);
            word.retryCount = word.retryCount || 0;
            word.lesson = word.lesson.toString();
        });
        localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
        updateTotalVocab();
        vocabulary.forEach((word, index) => addToTable(word, 'word', index + 1));
        populateLessonButtons();
        populateLessonDropdown();
        filterVocabularyTable();
        updateSelectedVocabCount();
    }

    if (localStorage.getItem('trashBin')) {
        trashBin = JSON.parse(localStorage.getItem('trashBin'));
        trashBin.forEach(word => addToTable(word, 'trash'));
    }

    document.getElementById('start-quiz-btn').addEventListener('click', () => {
        const selectedButtons = document.querySelectorAll('.lesson-buttons button.selected');
        const selectedLessons = Array.from(selectedButtons).map(btn => btn.dataset.lesson);
        if (selectedLessons.length === 0) {
            alert('Vui lòng chọn ít nhất một bài học.');
            return;
        }
        filteredVocab = vocabulary.filter(word => selectedLessons.includes(word.lesson.toString()));
        if (filteredVocab.length < 4) {
            alert('Không đủ từ vựng (ít nhất 4 từ) để bắt đầu quiz.');
            return;
        }
        correctWords = new Set();
        retryQueue = [];
        document.getElementById('lesson-selection').classList.add('hidden');
        document.querySelector('.quiz-card').classList.remove('hidden');
        updateProgressBar();
        loadQuiz();
    });

    document.getElementById('retry-interval').value = retryInterval;
    document.getElementById('retry-max').value = retryMax;
    updateProgressBar();

    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode-toggle').checked = true;
        document.querySelector('.icon-sun').classList.add('hidden');
        document.querySelector('.icon-moon').classList.remove('hidden');
    } else {
        document.querySelector('.icon-sun').classList.remove('hidden');
        document.querySelector('.icon-moon').classList.add('hidden');
    }
});

// Điền danh sách bài học vào nút
function populateLessonButtons() {
    const lessons = [...new Set(vocabulary.map(word => word.lesson))].sort((a, b) => a - b);
    const lessonButtonsContainer = document.getElementById('lesson-buttons');
    lessonButtonsContainer.innerHTML = '';
    lessons.forEach(lesson => {
        const button = document.createElement('button');
        const lessonLabel = isNaN(lesson) ? lesson : `Bài ${lesson}`;
        button.textContent = lessonLabel;
        button.dataset.lesson = lesson;
        button.addEventListener('click', () => {
            button.classList.toggle('selected');
            updateStartQuizButton();
            updateSelectedVocabCount();
        });
        lessonButtonsContainer.appendChild(button);
    });
}

// Cập nhật trạng thái nút "Bắt đầu Quiz"
function updateStartQuizButton() {
    const selectedButtons = document.querySelectorAll('.lesson-buttons button.selected');
    const selectedLessons = Array.from(selectedButtons).map(btn => btn.dataset.lesson);
    const filteredVocabTemp = vocabulary.filter(word => selectedLessons.includes(word.lesson.toString()));
    const startQuizBtn = document.getElementById('start-quiz-btn');
    const errorMessage = document.getElementById('error-message');
    if (filteredVocabTemp.length < 4) {
        errorMessage.classList.remove('hidden');
        startQuizBtn.disabled = true;
    } else {
        errorMessage.classList.add('hidden');
        startQuizBtn.disabled = false;
    }
}

// Quản lý giao diện các section
const sections = {
    home: document.getElementById('dashboard'),
    quiz: document.getElementById('quiz-section'),
    vocab: document.getElementById('vocab-section'),
    settings: document.getElementById('settings-section'),
    trash: document.getElementById('trash-section')
};

function hideAllSections() {
    Object.values(sections).forEach(section => section.classList.add('hidden'));
}

function showSection(sectionId) {
    // Ẩn tất cả các section trước
    hideAllSections();
    
    // Hiển thị section được chọn
    sections[sectionId].classList.remove('hidden');
    
    // Kiểm tra nếu section là "quiz"
    if (sectionId === 'quiz') {
        // Lấy trạng thái quiz từ localStorage
        const quizState = JSON.parse(localStorage.getItem('quizState'));
        
        // Kiểm tra xem có trạng thái quiz và câu hỏi hiện tại không phải null
        if (quizState && quizState.currentQuestion !== null) {
            // Khôi phục trạng thái quiz và hiển thị thẻ quiz
            restoreQuizState();
            document.getElementById('lesson-selection').classList.add('hidden');
            document.querySelector('.quiz-card').classList.remove('hidden');
        } else {
            // Nếu không có trạng thái, hiển thị phần chọn bài học
            document.getElementById('lesson-selection').classList.remove('hidden');
            document.querySelector('.quiz-card').classList.add('hidden');
        }
    }
}

document.getElementById('nav-home').addEventListener('click', () => showSection('home'));
document.getElementById('nav-quiz').addEventListener('click', () => showSection('quiz'));
document.getElementById('nav-vocab').addEventListener('click', () => showSection('vocab'));
document.getElementById('nav-settings').addEventListener('click', () => showSection('settings'));
showSection('home');

// Xử lý Dark Mode
document.getElementById('dark-mode-toggle').addEventListener('change', (e) => {
    if (e.target.checked) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'enabled');
        document.querySelector('.icon-sun').classList.add('hidden');
        document.querySelector('.icon-moon').classList.remove('hidden');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'disabled');
        document.querySelector('.icon-sun').classList.remove('hidden');
        document.querySelector('.icon-moon').classList.add('hidden');
    }
});

// Cập nhật tổng số từ vựng
function updateTotalVocab() {
    const total = vocabulary.length;
    document.getElementById('total-vocab').textContent = `Tổng số từ vựng: ${total}`;
    document.getElementById('total-vocab-count').textContent = `Tổng số từ vựng: ${total}`;
}

// Quản lý từ vựng
const addVocabForm = document.getElementById('add-vocab-form');
const wordTableBody = document.querySelector('#wordTable tbody');
const trashTableBody = document.querySelector('#trashTable tbody');

function addVocabulary(word) {
    if (!word.romaji) word.romaji = wanakana.toRomaji(word.hiragana);
    if (vocabulary.some(v => v.kanji === word.kanji && v.hiragana === word.hiragana)) {
        alert('Từ vựng đã tồn tại!');
        return false;
    }
    vocabulary.push(word);
    localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
    addToTable(word, 'word', vocabulary.length);
    updateTotalVocab();
    populateLessonButtons();
    populateLessonDropdown();
    filterVocabularyTable();
    return true;
}

function addToTable(word, tableType, index) {
    const tableBody = tableType === 'word' ? wordTableBody : trashTableBody;
    const newRow = document.createElement('tr');
    const kanjiDisplay = word.kanji || 'N/A';
    if (tableType === 'word') {
        newRow.innerHTML = `
            <td>${index}</td>
            <td>${kanjiDisplay}</td>
            <td>${word.hiragana}</td>
            <td>${word.romaji}</td>
            <td>${word.meaning}</td>
            <td>${word.lesson}</td>
            <td><button onclick="playAudio('${word.hiragana}')">🔊</button></td>
            <td>
                <button class="edit-btn"><i class="fas fa-edit"></i> Sửa</button>
                <button class="delete-btn"><i class="fas fa-trash"></i> Xóa</button>
            </td>
        `;
    } else {
        newRow.innerHTML = `
            <td>${kanjiDisplay}</td>
            <td>${word.hiragana}</td>
            <td>${word.romaji}</td>
            <td>${word.meaning}</td>
            <td>${word.lesson}</td>
            <td><button class="restore-btn"><i class="fas fa-undo"></i> Khôi phục</button></td>
        `;
    }
    tableBody.appendChild(newRow);
}

addVocabForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const kanji = document.getElementById('kanji').value || '';
    const hiragana = document.getElementById('hiragana').value;
    let romaji = document.getElementById('romaji').value;
    const meaning = document.getElementById('meaning').value;
    const lesson = document.getElementById('lesson').value.toString();
    const newVocab = { kanji, hiragana, romaji, meaning, lesson, originalIndex: vocabulary.length, retryCount: 0 };
    if (addVocabulary(newVocab)) addVocabForm.reset();
});

document.getElementById('import-excel-btn').addEventListener('click', () => {
    const fileInput = document.getElementById('excelFileInput');
    const file = fileInput.files[0];
    if (!file) {
        alert('Vui lòng chọn file Excel!');
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        let errors = [];
        jsonData.forEach((row, i) => {
            const kanji = row['Kanji'] || '';
            const hiragana = row['Hiragana/Katakana'];
            let romaji = row['Romaji'] || '';
            const meaning = row['Nghĩa'];
            const lesson = row['Bài'].toString();
            if (!hiragana || !meaning || !lesson) {
                errors.push(`Dòng ${i + 1}: Thiếu trường bắt buộc`);
                return;
            }
            const newVocab = { kanji, hiragana, romaji, meaning, lesson, originalIndex: vocabulary.length, retryCount: 0 };
            if (!addVocabulary(newVocab)) errors.push(`Dòng ${i + 1}: Từ vựng đã tồn tại`);
        });
        if (errors.length > 0) alert(`Import hoàn tất với lỗi:\n${errors.join('\n')}`);
        else alert('Import thành công!');
        fileInput.value = '';
    };
    reader.readAsArrayBuffer(file);
});

document.getElementById('download-excel-btn').addEventListener('click', () => {
    const worksheet = XLSX.utils.json_to_sheet(vocabulary.map(v => ({
        Kanji: v.kanji || 'N/A',
        'Hiragana/Katakana': v.hiragana,
        Romaji: v.romaji,
        Nghĩa: v.meaning,
        Bài: v.lesson
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Từ vựng');
    XLSX.writeFile(workbook, 'vocabulary.xlsx');
});

wordTableBody.addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (e.target.classList.contains('delete-btn')) {
        const word = {
            kanji: row.cells[1].textContent === 'N/A' ? '' : row.cells[1].textContent,
            hiragana: row.cells[2].textContent,
            romaji: row.cells[3].textContent,
            meaning: row.cells[4].textContent,
            lesson: row.cells[5].textContent,
            originalIndex: vocabulary.find(v => v.hiragana === row.cells[2].textContent).originalIndex,
            retryCount: 0
        };
        deleteVocabulary(word, row);
    } else if (e.target.classList.contains('edit-btn')) {
        const index = Array.from(wordTableBody.rows).indexOf(row);
        const word = vocabulary[index];
        document.getElementById('kanji').value = word.kanji;
        document.getElementById('hiragana').value = word.hiragana;
        document.getElementById('romaji').value = word.romaji;
        document.getElementById('meaning').value = word.meaning;
        document.getElementById('lesson').value = word.lesson;
        const originalSubmitHandler = addVocabForm.onsubmit;
        addVocabForm.onsubmit = (e) => {
            e.preventDefault();
            const updatedKanji = document.getElementById('kanji').value || '';
            const updatedHiragana = document.getElementById('hiragana').value;
            let updatedRomaji = document.getElementById('romaji').value || wanakana.toRomaji(updatedHiragana);
            const updatedMeaning = document.getElementById('meaning').value;
            const updatedLesson = document.getElementById('lesson').value.toString();
            vocabulary[index] = { kanji: updatedKanji, hiragana: updatedHiragana, romaji: updatedRomaji, meaning: updatedMeaning, lesson: updatedLesson, originalIndex: word.originalIndex, retryCount: word.retryCount };
            localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
            row.cells[1].textContent = updatedKanji || 'N/A';
            row.cells[2].textContent = updatedHiragana;
            row.cells[3].textContent = updatedRomaji;
            row.cells[4].textContent = updatedMeaning;
            row.cells[5].textContent = updatedLesson;

            row.classList.add('highlight');
            setTimeout(() => row.classList.remove('highlight'), 5000);

            const notification = document.getElementById('notification');
            notification.classList.remove('hidden');
            setTimeout(() => notification.classList.add('hidden'), 3000);

            addVocabForm.reset();
            addVocabForm.onsubmit = originalSubmitHandler;
            populateLessonDropdown();
            filterVocabularyTable();
        };
    }
});

document.getElementById('delete-all-vocab-btn').addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn xóa tất cả từ vựng?')) {
        trashBin.push(...vocabulary);
        vocabulary = [];
        localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
        localStorage.setItem('trashBin', JSON.stringify(trashBin));
        wordTableBody.innerHTML = '';
        updateTotalVocab();
        trashBin.forEach(word => addToTable(word, 'trash'));
        populateLessonDropdown();
        filterVocabularyTable();
    }
});

document.getElementById('permanent-delete-all-btn').addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn xóa vĩnh viễn tất cả từ vựng trong thùng rác?')) {
        trashBin = [];
        localStorage.setItem('trashBin', JSON.stringify(trashBin));
        trashTableBody.innerHTML = '';
    }
});

function deleteVocabulary(word, row) {
    const index = vocabulary.findIndex(v => v.hiragana === word.hiragana);
    if (index > -1) {
        vocabulary.splice(index, 1);
        trashBin.push(word);
        localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
        localStorage.setItem('trashBin', JSON.stringify(trashBin));
        row.remove();
        updateTotalVocab();
        addToTable(word, 'trash');
        populateLessonDropdown();
        filterVocabularyTable();
    }
}

trashTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('restore-btn')) {
        const row = e.target.closest('tr');
        const word = {
            kanji: row.cells[0].textContent === 'N/A' ? '' : row.cells[0].textContent,
            hiragana: row.cells[1].textContent,
            romaji: row.cells[2].textContent,
            meaning: row.cells[3].textContent,
            lesson: row.cells[4].textContent,
            originalIndex: trashBin.find(v => v.hiragana === row.cells[1].textContent).originalIndex,
            retryCount: 0
        };
        restoreVocabulary(word, row);
    }
});

function restoreVocabulary(word, row) {
    const index = trashBin.findIndex(v => v.hiragana === word.hiragana);
    if (index > -1) {
        trashBin.splice(index, 1);
        vocabulary.push(word);
        vocabulary.sort((a, b) => a.originalIndex - b.originalIndex);
        localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
        localStorage.setItem('trashBin', JSON.stringify(trashBin));
        row.remove();
        wordTableBody.innerHTML = '';
        vocabulary.forEach((word, i) => addToTable(word, 'word', i + 1));
        updateTotalVocab();
        populateLessonDropdown();
        filterVocabularyTable();
    }
}

document.getElementById('show-trash-btn').addEventListener('click', () => showSection('trash'));
document.getElementById('close-trash-btn').addEventListener('click', () => showSection('vocab'));

// Xử lý Quiz
const quizKanji = document.getElementById('quiz-kanji');
const quizMeaning = document.getElementById('quiz-meaning');
const optionBtns = document.querySelectorAll('.option-btn');
const quizFeedback = document.getElementById('quiz-feedback');
let currentQuizHiragana = '';
let currentQuizIndex = -1;

document.getElementById('back-to-lessons').addEventListener('click', () => {
    saveQuizState();
    document.getElementById('lesson-selection').classList.remove('hidden');
    document.querySelector('.quiz-card').classList.add('hidden');
});

document.getElementById('select-all-btn').addEventListener('click', () => {
    const buttons = document.querySelectorAll('.lesson-buttons button');
    buttons.forEach(button => button.classList.add('selected'));
    updateStartQuizButton();
    updateSelectedVocabCount();
});

function loadQuiz() {
    if (filteredVocab.length < 4) {
        alert('Có lỗi: Không đủ từ vựng để tiếp tục quiz.');
        showSection('quiz');
        return;
    }

    if (retryQueue.length && questionsSinceLastRetry >= retryInterval) {
        currentQuestion = retryQueue.shift();
        questionsSinceLastRetry = 0;
    } else {
        if (isRandomized) {
            let randomIndex;
            do {
                randomIndex = Math.floor(Math.random() * filteredVocab.length);
            } while (filteredVocab[randomIndex] === currentQuestion);
            currentQuestion = filteredVocab[randomIndex];
        } else {
            currentQuizIndex = (currentQuizIndex + 1) % filteredVocab.length;
            currentQuestion = filteredVocab[currentQuizIndex];
        }
    }

    quizKanji.textContent = currentQuestion.kanji || currentQuestion.hiragana;
    quizMeaning.textContent = currentQuestion.meaning;
    currentQuizHiragana = currentQuestion.hiragana;

    const correctOption = currentQuestion.hiragana;
    const similarOptions = getSimilarWords(currentQuestion, filteredVocab, 3);
    const options = [correctOption, ...similarOptions.map(opt => opt.hiragana)];
    while (options.length < 4) {
        const randomOption = filteredVocab[Math.floor(Math.random() * filteredVocab.length)].hiragana;
        if (!options.includes(randomOption)) options.push(randomOption);
    }

    options.sort(() => Math.random() - 0.5);
    optionBtns.forEach((btn, index) => {
        btn.textContent = options[index];
        btn.disabled = false;
        btn.classList.remove('correct', 'incorrect');
        btn.onclick = () => checkAnswer(btn, correctOption);
    });

    quizFeedback.textContent = '';
    saveQuizState();
}

function getSimilarWords(correctWord, allWords, numOptions = 3) {
    const similarWords = allWords.filter(word => word.hiragana !== correctWord.hiragana && (
        word.hiragana.startsWith(correctWord.hiragana[0]) ||
        word.hiragana.endsWith(correctWord.hiragana.slice(-1)) ||
        (word.kanji && correctWord.kanji && word.kanji.includes(correctWord.kanji[0]))
    ));
    const shuffled = similarWords.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, numOptions);
}

function checkAnswer(selectedBtn, correct) {
    const selected = selectedBtn.textContent;
    optionBtns.forEach(btn => {
        btn.disabled = true;
        if (btn.textContent === correct) btn.classList.add('correct');
        else if (btn === selectedBtn) btn.classList.add('incorrect');
    });

    if (selected === correct) {
        if (!correctWords.has(currentQuestion.originalIndex)) correctWords.add(currentQuestion.originalIndex);
        quizFeedback.innerHTML = `Đúng rồi! ${currentQuestion.hiragana} <span style="color: #1e90ff;">(${currentQuestion.romaji})</span>`;
        quizFeedback.style.color = '#28a745';
        const correctSound = document.getElementById('correct-sound');
        if (correctSound) correctSound.play();
        currentQuestion.retryCount = 0;
    } else {
        quizFeedback.innerHTML = `Sai rồi! Đáp án: ${correct} <span style="color: #1e90ff;">(${currentQuestion.romaji})</span>`;
        quizFeedback.style.color = '#dc3545';
        const incorrectSound = document.getElementById('incorrect-sound');
        if (incorrectSound) incorrectSound.play();
        if (currentQuestion.retryCount < retryMax) {
            currentQuestion.retryCount++;
            if (!retryQueue.includes(currentQuestion)) retryQueue.push(currentQuestion);
        }
    }

    questionsSinceLastRetry++;
    updateProgressBar();
    saveQuizState();
}

function playQuizAudio() {
    playAudio(quizKanji.textContent);
}

document.getElementById('quiz-next').addEventListener('click', loadQuiz);
document.getElementById('quiz-restart').addEventListener('click', () => {
    retryQueue = [];
    correctWords.clear();
    currentQuizIndex = -1;
    loadQuiz();
    updateProgressBar();
});

document.getElementById('show-meaning-btn').addEventListener('click', () => {
    isMeaningAlwaysVisible = !isMeaningAlwaysVisible;
    document.getElementById('show-meaning-btn').classList.toggle('active', isMeaningAlwaysVisible);
    quizMeaning.classList.toggle('hidden', !isMeaningAlwaysVisible);
    saveQuizState();
});

function playAudio(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    speechSynthesis.speak(utterance);
}

const clickSoundButtons = document.querySelectorAll('.sidebar li, .navigation button, #quick-quiz, #quick-add-vocab, #reset-vocab');
clickSoundButtons.forEach(button => {
    button.addEventListener('click', () => {
        const clickSound = document.getElementById('click-sound');
        if (clickSound) clickSound.play();
    });
});

document.getElementById('randomize-options-toggle').addEventListener('change', (e) => {
    isRandomized = e.target.checked;
    loadQuiz();
});

document.getElementById('quick-quiz').addEventListener('click', () => showSection('quiz'));
document.getElementById('quick-add-vocab').addEventListener('click', () => showSection('vocab'));

document.getElementById('reset-vocab').addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn reset từ vựng về mặc định?')) {
        fetch('default.xlsx')
            .then(response => response.arrayBuffer())
            .then(data => {
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                vocabulary = jsonData.map((row, index) => {
                    let romaji = row['Romaji'] || wanakana.toRomaji(row['Hiragana/Katakana']);
                    return {
                        kanji: row['Kanji'] || '',
                        hiragana: row['Hiragana/Katakana'],
                        romaji: romaji,
                        meaning: row['Nghĩa'],
                        lesson: row['Bài'].toString(),
                        originalIndex: index,
                        retryCount: 0
                    };
                });
                localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
                updateTotalVocab();
                wordTableBody.innerHTML = '';
                vocabulary.forEach((word, index) => addToTable(word, 'word', index + 1));
                populateLessonButtons();
                populateLessonDropdown();
                filterVocabularyTable();
                alert('Đã reset từ vựng về mặc định.');
            });
    }
});

// Hàm lưu trạng thái quiz
function saveQuizState() {
    const quizState = {
        filteredVocab: filteredVocab.map(word => word.originalIndex),
        correctWords: Array.from(correctWords),
        retryQueue: retryQueue.map(word => word.originalIndex),
        currentQuestion: currentQuestion ? currentQuestion.originalIndex : null,
        currentQuizIndex: currentQuizIndex,
        questionsSinceLastRetry: questionsSinceLastRetry,
        isRandomized: isRandomized,
        isMeaningAlwaysVisible: isMeaningAlwaysVisible
    };
    localStorage.setItem('quizState', JSON.stringify(quizState));
}

// Hàm khôi phục trạng thái quiz
function restoreQuizState() {
    const quizState = JSON.parse(localStorage.getItem('quizState'));
    if (quizState) {
        filteredVocab = quizState.filteredVocab.map(index => vocabulary.find(word => word.originalIndex === index));
        correctWords = new Set(quizState.correctWords);
        retryQueue = quizState.retryQueue.map(index => vocabulary.find(word => word.originalIndex === index));
        currentQuestion = quizState.currentQuestion ? vocabulary.find(word => word.originalIndex === quizState.currentQuestion) : null;
        currentQuizIndex = quizState.currentQuizIndex;
        questionsSinceLastRetry = quizState.questionsSinceLastRetry;
        isRandomized = quizState.isRandomized;
        isMeaningAlwaysVisible = quizState.isMeaningAlwaysVisible;

        updateProgressBar();
        if (currentQuestion) {
            loadQuiz();
            if (isMeaningAlwaysVisible) {
                document.getElementById('quiz-meaning').classList.remove('hidden');
                document.getElementById('show-meaning-btn').classList.add('active');
            } else {
                document.getElementById('quiz-meaning').classList.add('hidden');
                document.getElementById('show-meaning-btn').classList.remove('active');
            }
        }
    }
}

// Hàm điền danh sách bài học vào dropdown
function populateLessonDropdown() {
    const lessonSelect = document.getElementById('lesson-select');
    const lessons = [...new Set(vocabulary.map(word => word.lesson))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    while (lessonSelect.options.length > 1) {
        lessonSelect.remove(1);
    }
    lessons.forEach(lesson => {
        const option = document.createElement('option');
        option.value = lesson;
        const lessonLabel = isNaN(lesson) ? lesson : `Bài ${lesson}`;
        option.textContent = lessonLabel;
        lessonSelect.appendChild(option);
    });
}

// Hàm lọc bảng từ vựng dựa trên bài học được chọn
function filterVocabularyTable() {
    const selectedLesson = document.getElementById('lesson-select').value;
    const rows = wordTableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const lessonCell = row.cells[5].textContent;
        if (selectedLesson === 'all' || lessonCell === selectedLesson) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

document.getElementById('lesson-select').addEventListener('change', filterVocabularyTable);

// Cập nhật số lượng từ vựng đã chọn trong phần Quiz
function updateSelectedVocabCount() {
    const selectedButtons = document.querySelectorAll('.lesson-buttons button.selected');
    const selectedLessons = Array.from(selectedButtons).map(btn => btn.dataset.lesson);
    const filteredVocabTemp = vocabulary.filter(word => selectedLessons.includes(word.lesson.toString()));
    const selectedCount = filteredVocabTemp.length;
    document.getElementById('selected-vocab-count').textContent = `Đã chọn: ${selectedCount} từ vựng`;
}
