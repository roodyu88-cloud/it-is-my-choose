// State
let allCountries = [];
let availableCountries = [];
let currentMode = null;
let currentCardLeft = null;
let currentCardRight = null;
let selectedContinent = 'Europe';

// Tournament state
let tournamentQueue = [];
let tournamentWinners = [];
let tournamentRoundNum = 1;
let tournamentTotalRounds = 0;
let selectedTourneySize = 8;
let isFinishingEarly = false;
let advanceTimeout = null;
let isAnimating = false;
let consecutiveWinner = null;
let consecutiveCount = 0;
let askedAboutWinner = false;

// Global Real-Time Stats (GunDB)
const gun = Gun(['https://gun-manhattan.herokuapp.com/gun']);
const globalCountryRef = gun.get('countryChoiceQuiz_countries_v1');
const globalPlayersRef = gun.get('countryChoiceQuiz_players_v1');

// Persistence & Local Data
let userData = {
    userId: localStorage.getItem('countryQuiz_userId') || 'user_' + Math.random().toString(36).substr(2, 9),
    username: "Игрок_123",
    avatar: "adventurerNeutral-1781632109142.png",
    stats: {
        "winner-stays": 0,
        classic: 0,
        continental: 0,
        tournament: 0,
        blind: 0
    },
    totalGames: 0
};

// Local cache for leaderboards
let leaderboardCountries = {};
let leaderboardPlayers = {};

function loadUserData() {
    if (!localStorage.getItem('countryQuiz_userId')) {
        localStorage.setItem('countryQuiz_userId', userData.userId);
    }

    const saved = localStorage.getItem('countryQuiz_userData');
    if (saved) {
        const parsed = JSON.parse(saved);
        userData = { ...userData, ...parsed, stats: { ...userData.stats, ...(parsed.stats || {}) } };
    }
    
    // Sync current player to global DB
    syncPlayerToGlobal();
    
    // Listen for global changes
    globalCountryRef.map().on((count, name) => {
        leaderboardCountries[name] = count;
        renderLeaderboards();
    });

    globalPlayersRef.map().on((data, id) => {
        if (data) leaderboardPlayers[id] = data;
        renderLeaderboards();
    });

    updateProfileUI();
}

function syncPlayerToGlobal() {
    globalPlayersRef.get(userData.userId).put({
        name: userData.username,
        games: userData.totalGames
    });
}

function saveUserData() {
    localStorage.setItem('countryQuiz_userData', JSON.stringify(userData));
    syncPlayerToGlobal();
}

function updateProfileUI() {
    document.getElementById('username-display').textContent = userData.username;
    document.getElementById('profile-avatar-large').src = userData.avatar;
    document.getElementById('user-avatar-img').src = userData.avatar;
    document.getElementById('total-games-played').textContent = userData.totalGames;
    
    for (const [mode, count] of Object.entries(userData.stats)) {
        const el = document.getElementById(`stat-${mode}`);
        if (el) el.textContent = count;
    }
    renderLeaderboards();
}

function renderLeaderboards() {
    const playersList = document.querySelector('.leaderboard:first-child ol');
    const countriesList = document.querySelector('.leaderboard:last-child ol');

    if (!playersList || !countriesList) return;

    // Players: Sort by games
    const sortedPlayers = Object.values(leaderboardPlayers)
        .sort((a, b) => (b.games || 0) - (a.games || 0));
    
    playersList.innerHTML = sortedPlayers.slice(0, 5).map(p => 
        `<li>${p.name || 'Аноним'} <span>(${p.games || 0} игр)</span></li>`
    ).join('');

    // Countries: Sort by choices
    const sortedCountries = Object.entries(leaderboardCountries)
        .sort((a, b) => b[1] - a[1]);
    
    countriesList.innerHTML = sortedCountries.slice(0, 5).map(([name, count]) => 
        `<li>${name} <span>(${count} побед)</span></li>`
    ).join('');
}

function recordCountryChoice(countryName) {
    // Increment global count
    globalCountryRef.get(countryName).once((current) => {
        globalCountryRef.get(countryName).put((current || 0) + 1);
    });
}

// DOM Elements
const screens = {
    menu: document.getElementById('main-menu'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen'),
    profile: document.getElementById('profile-screen'),
    modal: document.getElementById('custom-modal')
};

const loader = document.getElementById('loader');
const cards = {
    left: document.getElementById('card-left'),
    right: document.getElementById('card-right')
};

// UI Elements
const finishEarlyBtn = document.getElementById('finish-early');
const tournamentInfo = document.getElementById('tournament-info');
const tournamentVisual = document.getElementById('tournament-bracket-visual');
const hideNamesCb = document.getElementById('hide-names');
const flagsOnlyCb = document.getElementById('flags-only');
const nextRoundBtn = document.getElementById('next-round-btn');

// Initialize
async function init() {
    loadUserData();
    showLoader();
    try {
        const response = await fetch('https://unpkg.com/world-countries@3.0.0/countries.json');
        if (!response.ok) throw new Error("HTTP " + response.status);
        const rawData = await response.json();
        
        const data = rawData.map(c => ({
            name: { common: c.name.common },
            flags: { svg: `https://flagcdn.com/w320/${c.cca2.toLowerCase()}.png` },
            capital: c.capital ? c.capital : [],
            region: c.region,
            population: c.area * 100, 
            independent: c.independent !== false
        }));

        allCountries = data.filter(c => c.population > 100000 && c.independent);
        if (allCountries.length === 0) throw new Error("No countries loaded");

        setupEventListeners();
        hideLoader();
    } catch (error) {
        console.error("Failed to load countries:", error);
        alert("Ошибка загрузки данных. Проверьте подключение к интернету.");
        hideLoader();
    }
}

// UI Components
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    void toast.offsetWidth; 
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 400);
    }, 2500);
}

function setupEventListeners() {
    document.querySelectorAll('.mode-btn:not(.tournament-card):not(.continent-card)').forEach(btn => {
        btn.addEventListener('click', () => {
            if(!isAnimating) startGame(btn.dataset.mode);
        });
    });

    const continentCard = document.querySelector('.continent-card');
    if (continentCard) {
        continentCard.addEventListener('click', () => {
            if(!isAnimating) startGame('continental');
        });
    }

    const tourneyCard = document.querySelector('.tournament-card');
    if (tourneyCard) {
        tourneyCard.addEventListener('click', () => {
            if(!isAnimating) startGame('tournament');
        });
    }

    [hideNamesCb, flagsOnlyCb].forEach(cb => {
        cb.addEventListener('change', () => {
            showToast("Настройки успешно применены!");
        });
    });

    document.getElementById('username-display').addEventListener('click', async () => {
        const newName = await showModal("Смена имени", "Введите новый никнейм:", false, true, userData.username);
        if (newName && typeof newName === 'string') {
            userData.username = newName.trim();
            saveUserData();
            updateProfileUI();
            showToast("Имя профиля обновлено!");
        }
    });

    document.getElementById('profile-avatar-large').addEventListener('click', async () => {
        const newUrl = await showModal("Смена аватара", "Введите прямую ссылку на изображение:", false, true, userData.avatar);
        if (newUrl && typeof newUrl === 'string') {
            userData.avatar = newUrl.trim();
            saveUserData();
            updateProfileUI();
            showToast("Аватар успешно изменен!");
        }
    });

    document.querySelectorAll('#tourney-size .pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('#tourney-size .pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            selectedTourneySize = parseInt(pill.dataset.val);
        });
    });

    document.querySelectorAll('#continent-select .pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('#continent-select .pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            selectedContinent = pill.dataset.val;
        });
    });

    cards.left.addEventListener('click', () => handleSelection('left'));
    cards.right.addEventListener('click', () => handleSelection('right'));

    document.getElementById('back-to-menu').addEventListener('click', showMenu);
    document.getElementById('restart-btn').addEventListener('click', showMenu);
    
    finishEarlyBtn.addEventListener('click', () => {
        if(isAnimating) {
            if(window.pendingWinner) {
                clearTimeout(advanceTimeout);
                showResultScreenEarly(window.pendingWinner);
            }
            return;
        }
        isFinishingEarly = true;
        finishEarlyBtn.textContent = "Выберите победителя!";
        finishEarlyBtn.classList.add('highlight');
    });

    nextRoundBtn.addEventListener('click', () => {
        if(advanceTimeout) {
            clearTimeout(advanceTimeout);
            advanceGame();
        }
    });
}

function showModal(title, message, isAlert = false, hasInput = false, defaultValue = "") {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-modal');
        const titleEl = document.getElementById('modal-title');
        const msgEl = document.getElementById('modal-message');
        const inputContainer = document.getElementById('modal-input-container');
        const inputField = document.getElementById('modal-input-field');
        const yesBtn = document.getElementById('modal-yes');
        const noBtn = document.getElementById('modal-no');

        titleEl.textContent = title;
        msgEl.textContent = message;
        
        if (hasInput) {
            inputContainer.classList.remove('hidden');
            inputField.value = defaultValue;
            setTimeout(() => inputField.focus(), 100);
        } else {
            inputContainer.classList.add('hidden');
        }

        if (isAlert) {
            noBtn.style.display = 'none';
            yesBtn.textContent = 'ОК';
        } else {
            noBtn.style.display = 'inline-block';
            yesBtn.textContent = hasInput ? 'Сохранить' : 'Да';
            noBtn.textContent = hasInput ? 'Отмена' : 'Нет';
        }

        modal.style.display = 'flex';
        void modal.offsetWidth;
        modal.classList.add('active');
        
        const cleanup = () => {
            modal.classList.remove('active');
            setTimeout(() => { modal.style.display = 'none'; }, 300);
            document.removeEventListener('keydown', keyHandler);
            yesBtn.onclick = null;
            noBtn.onclick = null;
        };

        const handleYes = () => { 
            const val = hasInput ? inputField.value : true;
            cleanup(); 
            resolve(val); 
        };
        const handleNo = () => { cleanup(); resolve(false); };

        yesBtn.onclick = handleYes;
        noBtn.onclick = handleNo;

        const keyHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleYes();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleNo();
            }
        };
        document.addEventListener('keydown', keyHandler);
    });
}

async function advanceGame() {
    isAnimating = false;
    nextRoundBtn.classList.add('hidden');
    
    const selectedCountry = window.pendingWinner;
    const container = document.querySelector('.cards-container');
    
    recordCountryChoice(selectedCountry.name.common);

    if (consecutiveWinner && consecutiveWinner.name.common === selectedCountry.name.common) {
        consecutiveCount++;
    } else {
        consecutiveWinner = selectedCountry;
        consecutiveCount = 1;
        askedAboutWinner = false;
    }

    if (consecutiveCount === 5 && !askedAboutWinner) {
        setTimeout(async () => {
            const isThisIt = await showModal("Секундочку!", `Вы выбрали "${selectedCountry.name.common}" уже 5 раз подряд! Это ваша идеальная страна?`);
            if (isThisIt) {
                showResultScreenEarly(selectedCountry);
            } else {
                askedAboutWinner = true;
                processNextRound(selectedCountry, container);
            }
        }, 50);
        return;
    } else if (consecutiveCount >= 10) {
        await showModal("Победитель найден!", `Вы выбрали "${selectedCountry.name.common}" 10 раз подряд! Победитель определен автоматически.`, true);
        showResultScreenEarly(selectedCountry);
        return;
    }

    processNextRound(selectedCountry, container);
}

function processNextRound(selectedCountry, container) {
    container.style.opacity = '0';
    
    setTimeout(() => {
        cards.left.className = 'card';
        cards.right.className = 'card';

        if (isFinishingEarly) {
            isFinishingEarly = false;
            finishEarlyBtn.textContent = "Мой выбор!";
            finishEarlyBtn.classList.remove('highlight');
            
            let nextOptions = [];
            for(let i=0; i<4; i++) nextOptions.push(getRandomCountry());
            showResult(selectedCountry, nextOptions);
            container.style.opacity = '1';
            return;
        }

        if (currentMode === 'classic' || currentMode === 'blind') {
            setupClassicRound();
        } else if (currentMode === 'winner-stays' || currentMode === 'continental') {
            currentCardLeft = selectedCountry;
            currentCardRight = getRandomCountry();
            renderCards();
        } else if (currentMode === 'tournament') {
            advanceTournament(selectedCountry);
        }
        
        setTimeout(() => { container.style.opacity = '1'; }, 50);
    }, 300);
}

function showResultScreenEarly(selectedCountry) {
    isFinishingEarly = false;
    finishEarlyBtn.textContent = "Мой выбор!";
    finishEarlyBtn.classList.remove('highlight');
    
    let nextOptions = [];
    for(let i=0; i<4; i++) nextOptions.push(getRandomCountry());
    showResult(selectedCountry, nextOptions);
}

function startGame(mode) {
    currentMode = mode;
    availableCountries = [...allCountries];
    
    userData.totalGames++;
    userData.stats[mode]++;
    saveUserData();
    updateProfileUI();

    if (hideNamesCb.checked) screens.game.classList.add('hide-names');
    else screens.game.classList.remove('hide-names');
    
    if (flagsOnlyCb.checked) screens.game.classList.add('flags-only');
    else screens.game.classList.remove('flags-only');

    tournamentInfo.classList.add('hidden');
    isFinishingEarly = false;
    finishEarlyBtn.textContent = "Мой выбор!";
    finishEarlyBtn.classList.remove('highlight');
    nextRoundBtn.classList.add('hidden');
    isAnimating = false;
    consecutiveCount = 0;
    consecutiveWinner = null;
    askedAboutWinner = false;

    cards.left.className = 'card';
    cards.right.className = 'card';

    if (mode === 'tournament') {
        setupTournament();
    } else {
        if (mode === 'continental') {
            availableCountries = allCountries.filter(c => c.region === selectedContinent || (selectedContinent === 'Americas' && c.region === 'Americas'));
        } else if (mode === 'blind') {
            screens.game.classList.add('hide-names', 'flags-only');
        }
        setupClassicRound();
    }

    switchScreen('game');
}

function getRandomCountry() {
    if (availableCountries.length === 0) availableCountries = [...allCountries];
    const index = Math.floor(Math.random() * availableCountries.length);
    return availableCountries.splice(index, 1)[0];
}

function setupClassicRound() {
    currentCardLeft = getRandomCountry();
    currentCardRight = getRandomCountry();
    renderCards();
}

const imageCache = {};
async function getImageUrl(country) {
    if (!country.capital || country.capital.length === 0) return null;
    const capital = country.capital[0];
    if (imageCache[capital]) return imageCache[capital];
    
    try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(capital)}`);
        if(res.ok) {
            const data = await res.json();
            if (data.originalimage && data.originalimage.source) {
                imageCache[capital] = data.originalimage.source;
                return imageCache[capital];
            }
        }
    } catch(e) {}
    return null;
}

async function renderCard(element, country) {
    element.querySelector('.country-name .real-text').textContent = country.name.common;
    element.querySelector('.flag').src = country.flags.svg;
    element.querySelector('.capital .real-text').textContent = country.capital.length ? country.capital[0] : 'Нет';
    element.querySelector('.region .real-text').textContent = country.region;
    
    const bgEl = element.querySelector('.card-bg');
    bgEl.style.backgroundImage = 'none';
    bgEl.classList.add('gradient-fallback');
    
    const imgUrl = await getImageUrl(country);
    if (imgUrl) {
        bgEl.style.backgroundImage = `url('${imgUrl}')`;
        bgEl.classList.remove('gradient-fallback');
    }
}

function renderCards() {
    renderCard(cards.left, currentCardLeft);
    renderCard(cards.right, currentCardRight);
}

function handleSelection(side) {
    if (isAnimating) return;
    isAnimating = true;

    const selectedElement = cards[side];
    const unselectedElement = side === 'left' ? cards.right : cards.left;
    const selectedCountry = side === 'left' ? currentCardLeft : currentCardRight;

    selectedElement.classList.add('selected');
    unselectedElement.classList.add('unselected');
    selectedElement.classList.add('revealed');
    unselectedElement.classList.add('revealed');

    window.pendingWinner = selectedCountry;
    nextRoundBtn.classList.remove('hidden');
    advanceTimeout = setTimeout(advanceGame, 1500); 
}

function setupTournament() {
    tournamentInfo.classList.remove('hidden');
    tournamentQueue = [];
    tournamentWinners = [];
    tournamentRoundNum = 1;

    const poolSize = selectedTourneySize || 8;
    tournamentTotalRounds = Math.log2(poolSize);

    let pool = [...availableCountries];
    for(let i = 0; i < poolSize; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        tournamentQueue.push(pool.splice(idx, 1)[0]);
    }
    
    playTournamentMatch();
}

function updateTournamentVisuals() {
    const totalMatchesInRound = (tournamentQueue.length + tournamentWinners.length * 2) / 2;
    const matchesPlayed = tournamentWinners.length;
    
    tournamentVisual.innerHTML = '';
    for(let i=0; i < totalMatchesInRound; i++) {
        const node = document.createElement('div');
        node.className = 'tourney-node';
        if (i < matchesPlayed) node.classList.add('done');
        else if (i === matchesPlayed) node.classList.add('active');
        tournamentVisual.appendChild(node);
    }
}

function playTournamentMatch() {
    if (tournamentQueue.length === 0) {
        if (tournamentWinners.length === 1) {
            showResult(tournamentWinners[0]);
            return;
        }
        tournamentQueue = [...tournamentWinners];
        tournamentWinners = [];
        tournamentRoundNum++;
    }

    currentCardLeft = tournamentQueue.shift();
    currentCardRight = tournamentQueue.shift();

    const roundsLeft = tournamentTotalRounds - tournamentRoundNum;
    let roundName = `Раунд ${tournamentRoundNum}`;
    if (roundsLeft === 0) roundName = "Финал";
    else if (roundsLeft === 1) roundName = "Полуфинал";
    else if (roundsLeft === 2) roundName = "Четвертьфинал";
    else if (roundsLeft === 3) roundName = "1/8 Финала";
    else if (roundsLeft === 4) roundName = "1/16 Финала";
    
    document.getElementById('tournament-round-name').textContent = roundName;
    updateTournamentVisuals();
    renderCards();
}

function advanceTournament(winner) {
    tournamentWinners.push(winner);
    playTournamentMatch();
}

async function showResult(winner, nextCountries = []) {
    document.getElementById('winner-name').textContent = winner.name.common;
    document.getElementById('winner-flag').src = winner.flags.svg;
    recordCountryChoice(winner.name.common); 
    
    const bgEl = document.getElementById('result-bg');
    bgEl.style.backgroundImage = 'none';
    const imgUrl = await getImageUrl(winner);
    if (imgUrl) {
        bgEl.style.backgroundImage = `url('${imgUrl}')`;
    }

    const nextList = document.getElementById('next-countries-list');
    nextList.innerHTML = '';
    if (nextCountries.length > 0) {
        document.getElementById('what-was-next').classList.remove('hidden');
        nextCountries.forEach(c => {
            const div = document.createElement('div');
            div.className = 'next-country-mini';
            div.innerHTML = `<img src="${c.flags.svg}" alt="${c.name.common}"><span>${c.name.common}</span>`;
            nextList.appendChild(div);
        });
    } else {
        document.getElementById('what-was-next').classList.add('hidden');
    }

    switchScreen('result');
}

function switchScreen(screenName) {
    const active = document.querySelector('.screen.active');
    const next = screens[screenName];
    
    if (active && active !== next) {
        active.style.opacity = '0';
        setTimeout(() => {
            active.classList.remove('active');
            next.classList.add('active');
            void next.offsetWidth; 
            next.style.opacity = '1';
        }, 400); 
    } else {
        next.classList.add('active');
        void next.offsetWidth;
        next.style.opacity = '1';
    }
}

function showMenu() { switchScreen('menu'); }
function showLoader() { loader.classList.remove('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }

window.onload = init;