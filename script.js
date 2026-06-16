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

// DOM Elements
const screens = {
    menu: document.getElementById('main-menu'),
    game: document.getElementById('game-screen'),
    result: document.getElementById('result-screen'),
    profile: document.getElementById('profile-screen')
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
            population: c.area * 100, // mock population based on area for filter
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

function setupEventListeners() {
    // Mode selection (exclude ones with complex buttons inside like continent and tourney)
    document.querySelectorAll('.mode-btn:not(.tournament-card):not(.continent-card)').forEach(btn => {
        btn.addEventListener('click', () => {
            if(!isAnimating) startGame(btn.dataset.mode);
        });
    });

    // Continent Card itself triggers continental mode
    const continentCard = document.querySelector('.continent-card');
    if (continentCard) {
        continentCard.addEventListener('click', () => {
            if(!isAnimating) startGame('continental');
        });
    }

    // Tournament Card itself triggers tournament
    const tourneyCard = document.querySelector('.tournament-card');
    if (tourneyCard) {
        tourneyCard.addEventListener('click', () => {
            if(!isAnimating) startGame('tournament');
        });
    }

    // Pills logic
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

    // Card clicks
    cards.left.addEventListener('click', () => handleSelection('left'));
    cards.right.addEventListener('click', () => handleSelection('right'));

    // Navigation
    document.getElementById('back-to-menu').addEventListener('click', showMenu);
    document.getElementById('restart-btn').addEventListener('click', showMenu);
    
    // Finish early
    finishEarlyBtn.addEventListener('click', () => {
        if(isAnimating) {
            // If they click finish early WHILE animating, just instantly win with the selected country
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

    // Skip wait button
    nextRoundBtn.addEventListener('click', () => {
        if(advanceTimeout) {
            clearTimeout(advanceTimeout);
            advanceGame();
        }
    });

    // Profile Avatar Save
    const saveAvatarBtn = document.getElementById('save-avatar-btn');
    if (saveAvatarBtn) {
        saveAvatarBtn.addEventListener('click', () => {
            const url = document.getElementById('avatar-url-input').value.trim();
            if (url) {
                document.getElementById('profile-avatar-large').src = url;
                document.getElementById('user-avatar-img').src = url;
                document.getElementById('avatar-url-input').value = '';
            }
        });
    }
}

function showResultScreenEarly(selectedCountry) {
    isFinishingEarly = false;
    finishEarlyBtn.textContent = "Мой выбор!";
    finishEarlyBtn.classList.remove('highlight');
    
    let nextOptions = [];
    for(let i=0; i<4; i++) nextOptions.push(getRandomCountry());
    showResult(selectedCountry, nextOptions);
}

// Game Flow
function startGame(mode) {
    currentMode = mode;
    availableCountries = [...allCountries];
    
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

// Rendering
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
    
    // Always fetch image, CSS will hide it if needed
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

// Interaction logic
function handleSelection(side) {
    if (isAnimating) return;
    isAnimating = true;

    const selectedElement = cards[side];
    const unselectedElement = side === 'left' ? cards.right : cards.left;
    const selectedCountry = side === 'left' ? currentCardLeft : currentCardRight;

    selectedElement.classList.add('selected');
    unselectedElement.classList.add('unselected');

    // Force reveal BOTH cards info so user sees what they missed
    selectedElement.classList.add('revealed');
    unselectedElement.classList.add('revealed');

    window.pendingWinner = selectedCountry;
    
    nextRoundBtn.classList.remove('hidden');
    advanceTimeout = setTimeout(advanceGame, 1500); 
}

function showModal(title, message, isAlert = false) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-modal');
        const titleEl = document.getElementById('modal-title');
        const msgEl = document.getElementById('modal-message');
        const yesBtn = document.getElementById('modal-yes');
        const noBtn = document.getElementById('modal-no');

        titleEl.textContent = title;
        msgEl.textContent = message;
        
        if (isAlert) {
            noBtn.style.display = 'none';
            yesBtn.textContent = 'ОК';
        } else {
            noBtn.style.display = 'inline-block';
            yesBtn.textContent = 'Да';
            noBtn.textContent = 'Нет';
        }

        modal.classList.add('active');
        
        const cleanup = () => {
            modal.classList.remove('active');
            document.removeEventListener('keydown', keyHandler);
            yesBtn.onclick = null;
            noBtn.onclick = null;
        };

        const handleYes = () => { cleanup(); resolve(true); };
        const handleNo = () => { cleanup(); resolve(false); };

        yesBtn.onclick = handleYes;
        noBtn.onclick = handleNo;

        const keyHandler = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleYes();
            } else if (e.key === 'Escape' && !isAlert) {
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
    
    // Consecutive logic
    if (consecutiveWinner && consecutiveWinner.name.common === selectedCountry.name.common) {
        consecutiveCount++;
    } else {
        consecutiveWinner = selectedCountry;
        consecutiveCount = 1;
        askedAboutWinner = false;
    }

    if (consecutiveCount === 5 && !askedAboutWinner) {
        // Wait a tiny bit for the UI, then show modal
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
    // Fade out
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
        
        // Fade back in
        setTimeout(() => { container.style.opacity = '1'; }, 50);
    }, 300);
}

// Tournament Logic
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
    
    // Set background to winner's capital image
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


// Utils
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

// Run
window.onload = init;