// Khởi tạo mảng từ vựng và thùng rác
let vocabulary = [];
let trashBin = [];
let currentQuestion = null;
let isRandomized = false; // Mặc định không random câu hỏi
let isMeaningAlwaysVisible = false;
let retryQueue = []; // Hàng đợi ôn lại
let questionsSinceLastRetry = 0; // Đếm số câu từ lần ôn lại cuối
let correctWords = new Set(); // Theo dõi các từ vựng đã trả lời đúng

// Lấy giá trị từ localStorage hoặc mặc định
let retryInterval = localStorage.getItem('retryInterval') ? parseInt(localStorage.getItem('retryInterval'), 10) : 10;
let retryMax = localStorage.getItem('retryMax') ? parseInt(localStorage.getItem('retryMax'), 10) : 3;

// Cập nhật giá trị khi người dùng thay đổi cài đặt
document.getElementById('retry-interval').addEventListener('change', (e) => {
    retryInterval = parseInt(e.target.value, 10);
    localStorage.setItem('retryInterval', retryInterval);
});
document.getElementById('retry-max').addEventListener('change', (e) => {
    retryMax = parseInt(e.target.value, 10);
    localStorage.setItem('retryMax', retryMax);
});

// Tải từ vựng từ localStorage khi load trang
window.addEventListener('load', () => {
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
                        originalIndex: index,
                        retryCount: 0
                    };
                });
                localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
                updateTotalVocab();
                vocabulary.forEach((word, index) => addToTable(word, 'word', index + 1));
            });
    } else {
        vocabulary = JSON.parse(localStorage.getItem('vocabulary'));
        vocabulary.forEach(word => {
            if (!word.romaji) word.romaji = wanakana.toRomaji(word.hiragana);
            word.retryCount = word.retryCount || 0;
        });
        localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
        updateTotalVocab();
        vocabulary.forEach((word, index) => addToTable(word, 'word', index + 1));
    }
    if (localStorage.getItem('trashBin')) {
        trashBin = JSON.parse(localStorage.getItem('trashBin'));
        trashBin.forEach(word => addToTable(word, 'trash'));
    }

    // Khôi phục tiến trình quiz
    const savedProgress = JSON.parse(localStorage.getItem('quizProgress'));
    if (savedProgress) {
        retryQueue = savedProgress.retryQueue.map(index => vocabulary.find(word => word.originalIndex === index));
        if (!retryQueue) retryQueue = [];
        correctWords = new Set(savedProgress.correctWords);
    }

    // Đồng bộ giá trị cài đặt từ localStorage
    document.getElementById('retry-interval').value = retryInterval;
    document.getElementById('retry-max').value = retryMax;

    updateProgressBar(); // Cập nhật thanh tiến độ khi load trang

    // Kiểm tra chế độ dark mode từ localStorage
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

// Chuyển đổi Section
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
    hideAllSections();
    sections[sectionId].classList.remove('hidden');
    if (sectionId === 'quiz' && currentQuestion == null) {
        loadQuiz();
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
    const totalVocabElement = document.getElementById('total-vocab');
    const totalVocabCountElement = document.getElementById('total-vocab-count');
    const total = vocabulary.length;
    if (totalVocabElement) totalVocabElement.textContent = `Tổng số từ vựng: ${total}`;
    if (totalVocabCountElement) totalVocabCountElement.textContent = `Tổng số từ vựng: ${total}`;
}

// Quản lý từ vựng
const addVocabForm = document.getElementById('add-vocab-form');
const wordTableBody = document.querySelector('#wordTable tbody');
const trashTableBody = document.querySelector('#trashTable tbody');

// Hàm thêm từ vựng
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
    return true;
}

// Hàm thêm hàng vào bảng
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
            <td><button class="restore-btn"><i class="fas fa-undo"></i> Khôi phục</button></td>
        `;
    }
    tableBody.appendChild(newRow);
}

// Xử lý thêm từ vựng thủ công
addVocabForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const kanji = document.getElementById('kanji').value || '';
    const hiragana = document.getElementById('hiragana').value;
    let romaji = document.getElementById('romaji').value;
    const meaning = document.getElementById('meaning').value;
    const newVocab = { kanji, hiragana, romaji, meaning, originalIndex: vocabulary.length, retryCount: 0 };
    if (addVocabulary(newVocab)) addVocabForm.reset();
});

// Nhập từ Excel
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
        for (const row of jsonData) {
            const kanji = row['Kanji'] || '';
            const hiragana = row['Hiragana/Katakana'];
            let romaji = row['Romaji'] || '';
            const meaning = row['Nghĩa'];
            if (!hiragana || !meaning) {
                errors.push(`Dòng ${jsonData.indexOf(row) + 1}: Thiếu trường bắt buộc`);
                continue;
            }
            const newVocab = { kanji, hiragana, romaji, meaning, originalIndex: vocabulary.length, retryCount: 0 };
            if (!addVocabulary(newVocab)) errors.push(`Dòng ${jsonData.indexOf(row) + 1}: Từ vựng đã tồn tại`);
        }
        if (errors.length > 0) alert(`Import hoàn tất với lỗi:\n${errors.join('\n')}`);
        else alert('Import thành công!');
        fileInput.value = '';
    };
    reader.readAsArrayBuffer(file);
});

// Tải file Excel từ vựng
document.getElementById('download-excel-btn').addEventListener('click', () => {
    const worksheet = XLSX.utils.json_to_sheet(vocabulary.map(v => ({
        Kanji: v.kanji || 'N/A',
        'Hiragana/Katakana': v.hiragana,
        Romaji: v.romaji,
        Nghĩa: v.meaning
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Từ vựng');
    XLSX.writeFile(workbook, 'vocabulary.xlsx');
});

// Xử lý xóa và sửa từ vựng
wordTableBody.addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (e.target.classList.contains('delete-btn')) {
        const word = {
            kanji: row.cells[1].textContent === 'N/A' ? '' : row.cells[1].textContent,
            hiragana: row.cells[2].textContent,
            romaji: row.cells[3].textContent,
            meaning: row.cells[4].textContent,
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
        const originalSubmitHandler = addVocabForm.onsubmit;
        addVocabForm.onsubmit = (e) => {
            e.preventDefault();
            const updatedKanji = document.getElementById('kanji').value || '';
            const updatedHiragana = document.getElementById('hiragana').value;
            let updatedRomaji = document.getElementById('romaji').value;
            const updatedMeaning = document.getElementById('meaning').value;
            if (!updatedRomaji) updatedRomaji = wanakana.toRomaji(updatedHiragana);
            vocabulary[index] = { kanji: updatedKanji, hiragana: updatedHiragana, romaji: updatedRomaji, meaning: updatedMeaning, originalIndex: word.originalIndex, retryCount: word.retryCount };
            localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
            row.cells[1].textContent = updatedKanji || 'N/A';
            row.cells[2].textContent = updatedHiragana;
            row.cells[3].textContent = updatedRomaji;
            row.cells[4].textContent = updatedMeaning;
            addVocabForm.reset();
            addVocabForm.onsubmit = originalSubmitHandler;
        };
    }
});

// Xóa tất cả từ vựng
document.getElementById('delete-all-vocab-btn').addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn xóa tất cả từ vựng?')) {
        trashBin.push(...vocabulary);
        vocabulary = [];
        localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
        localStorage.setItem('trashBin', JSON.stringify(trashBin));
        wordTableBody.innerHTML = '';
        updateTotalVocab();
        trashBin.forEach(word => addToTable(word, 'trash'));
    }
});

// Xóa vĩnh viễn trong thùng rác
document.getElementById('permanent-delete-all-btn').addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn xóa vĩnh viễn tất cả từ vựng trong thùng rác?')) {
        trashBin = [];
        localStorage.setItem('trashBin', JSON.stringify(trashBin));
        trashTableBody.innerHTML = '';
    }
});

// Hàm xóa từ vựng
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
    }
}

// Khôi phục từ vựng
trashTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('restore-btn')) {
        const row = e.target.closest('tr');
        const word = {
            kanji: row.cells[0].textContent === 'N/A' ? '' : row.cells[0].textContent,
            hiragana: row.cells[1].textContent,
            romaji: row.cells[2].textContent,
            meaning: row.cells[3].textContent,
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
    }
}

// Hiển thị/Ẩn thùng rác
document.getElementById('show-trash-btn').addEventListener('click', () => showSection('trash'));
document.getElementById('close-trash-btn').addEventListener('click', () => showSection('vocab'));

// Xử lý Quiz
const quizKanji = document.getElementById('quiz-kanji');
const quizMeaning = document.getElementById('quiz-meaning');
const optionBtns = document.querySelectorAll('.option-btn');
const quizFeedback = document.getElementById('quiz-feedback');
let currentQuizHiragana = '';
let currentQuizIndex = -1; // Theo dõi câu hỏi hiện tại

function loadQuiz() {
    if (vocabulary.length === 0) {
        quizKanji.textContent = 'Không có từ vựng';
        quizMeaning.classList.add('hidden');
        optionBtns.forEach(btn => {
            btn.textContent = '';
            btn.disabled = true;
        });
        quizFeedback.textContent = '';
        return;
    }

    // Kiểm tra nếu có từ cần ôn lại trong retryQueue và đã trả lời đủ số câu
    if (retryQueue.length > 0 && questionsSinceLastRetry >= retryInterval) {
        currentQuestion = retryQueue.shift();
        questionsSinceLastRetry = 0; // Reset đếm câu sau khi ôn lại
    } else {
        if (isRandomized) {
            let randomIndex;
            do {
                randomIndex = Math.floor(Math.random() * vocabulary.length);
            } while (vocabulary[randomIndex] === currentQuestion); // Tránh lặp lại câu hiện tại
            currentQuestion = vocabulary[randomIndex];
        } else {
            currentQuizIndex = (currentQuizIndex + 1) % vocabulary.length;
            currentQuestion = vocabulary[currentQuizIndex];
        }
    }

    if (currentQuestion.kanji) {
        quizKanji.textContent = currentQuestion.kanji;
    } else {
        quizKanji.textContent = currentQuestion.hiragana;
    }

    quizMeaning.textContent = currentQuestion.meaning;
    currentQuizHiragana = currentQuestion.hiragana;

    const correctOption = currentQuestion.hiragana;
    const similarOptions = getSimilarWords(currentQuestion, vocabulary, 3);
    const options = [correctOption, ...similarOptions.map(opt => opt.hiragana)];
    if (options.length < 4) {
        while (options.length < 4) {
            const randomOption = vocabulary[Math.floor(Math.random() * vocabulary.length)].hiragana;
            if (!options.includes(randomOption)) options.push(randomOption);
        }
    }

    // Luôn xáo trộn tùy chọn
    options.sort(() => Math.random() - 0.5);

    optionBtns.forEach((btn, index) => {
        btn.textContent = options[index];
        btn.disabled = false;
        btn.classList.remove('correct', 'incorrect');
        btn.onclick = () => checkAnswer(btn, correctOption);
    });

    quizFeedback.textContent = '';
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
        if (btn.textContent === correct) {
            btn.classList.add('correct');
        } else if (btn === selectedBtn) {
            btn.classList.add('incorrect');
        }
    });

    if (selected === correct) {
        if (!correctWords.has(currentQuestion.originalIndex)) {
            correctWords.add(currentQuestion.originalIndex);
        }
        quizFeedback.innerHTML = `Đúng rồi! ${currentQuestion.hiragana} <span style="color: #1e90ff;">(${currentQuestion.romaji})</span>`;
        quizFeedback.style.color = '#28a745';
        document.getElementById('correct-sound').play();
        currentQuestion.retryCount = 0; // Reset retryCount nếu trả lời đúng
    } else {
        quizFeedback.innerHTML = `Sai rồi! Đáp án: ${correct} <span style="color: #1e90ff;">(${currentQuestion.romaji})</span>`;
        quizFeedback.style.color = '#dc3545';
        document.getElementById('incorrect-sound').play();
        if (currentQuestion.retryCount < retryMax) {
            currentQuestion.retryCount++;
            if (!retryQueue.includes(currentQuestion)) {
                retryQueue.push(currentQuestion);
            }
        }
    }

    questionsSinceLastRetry++; // Tăng số câu đã trả lời
    updateProgressBar(); // Cập nhật thanh tiến độ
    saveQuizProgress(); // Lưu tiến trình
}

// Phát âm trong quiz
function playQuizAudio() {
    const textToSpeak = quizKanji.textContent;
    playAudio(textToSpeak);
}

// Nút điều hướng Quiz
document.getElementById('quiz-next').addEventListener('click', loadQuiz);
document.getElementById('quiz-restart').addEventListener('click', () => {
    retryQueue = [];
    correctWords.clear(); // Xóa tất cả từ đã trả lời đúng
    currentQuizIndex = -1; // Reset index câu hỏi
    loadQuiz();
    updateProgressBar(); // Cập nhật thanh tiến độ
});

// Hiển thị nghĩa trong quiz
document.getElementById('show-meaning-btn').addEventListener('click', () => {
    isMeaningAlwaysVisible = !isMeaningAlwaysVisible;
    document.getElementById('show-meaning-btn').classList.toggle('active', isMeaningAlwaysVisible);
    const meaning = document.getElementById('quiz-meaning');
    if (isMeaningAlwaysVisible) {
        meaning.classList.remove('hidden');
    } else {
        meaning.classList.add('hidden');
    }
});

// Phát âm từ vựng
function playAudio(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    speechSynthesis.speak(utterance);
}

// Âm thanh khi click nút
const clickSoundButtons = document.querySelectorAll('.sidebar li, .navigation button, #quick-quiz, #quick-add-vocab, #reset-vocab');
clickSoundButtons.forEach(button => {
    button.addEventListener('click', () => {
        document.getElementById('click-sound').play();
    });
});

// Toggle random đáp án và load câu hỏi mới khi bật/tắt
document.getElementById('randomize-options-toggle').addEventListener('change', (e) => {
    isRandomized = e.target.checked;
    loadQuiz(); // Load câu hỏi mới ngay lập tức
});

// Nút liên kết nhanh trên trang chủ
document.getElementById('quick-quiz').addEventListener('click', () => {
    showSection('quiz');
    loadQuiz();
});
document.getElementById('quick-add-vocab').addEventListener('click', () => showSection('vocab'));

// Nút reset từ vựng mặc định
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
                        originalIndex: index,
                        retryCount: 0
                    };
                });
                localStorage.setItem('vocabulary', JSON.stringify(vocabulary));
                updateTotalVocab();
                wordTableBody.innerHTML = '';
                vocabulary.forEach((word, index) => addToTable(word, 'word', index + 1));
                alert('Đã reset từ vựng về mặc định.');
            });
    }
});

// Lưu tiến trình quiz
function saveQuizProgress() {
    const quizProgress = {
        retryQueue: retryQueue.map(word => word.originalIndex),
        correctWords: Array.from(correctWords)
    };
    localStorage.setItem('quizProgress', JSON.stringify(quizProgress));
}

// Cập nhật thanh tiến độ
function updateProgressBar() {
    const totalVocab = vocabulary.length;
    const progressPercent = totalVocab > 0 ? (correctWords.size / totalVocab) * 100 : 0;
    document.getElementById('progress').style.width = `${progressPercent}%`;
    document.getElementById('progress-text').textContent = `${correctWords.size}/${totalVocab}`;
}