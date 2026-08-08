/* ============================================================
   MOF Explorer — i18n (한국어 / English)
   No framework, no build step. Works on GitHub Pages and inside
   the Capacitor Android app (same web assets).

   Two layers:
   1) data-i18n attributes  → used by the injected nav/footer (nav.js).
   2) Body text dictionary  → this file also swaps Korean page text
      to English by matching whole text nodes / attributes against
      KO2EN below. So the 4 pages translate WITHOUT editing their
      HTML. A MutationObserver catches text added later (e.g. game
      screens) as long as its Korean is in KO2EN.

   Put this file at  js/i18n.js  and load it BEFORE js/nav.js
   (no `async`).  The chosen language persists in localStorage.
   ============================================================ */
(function () {
  var STORAGE_KEY = 'mofx_lang';
  var DEFAULT = 'ko';

  /* ---- data-i18n dictionary (nav / footer / buttons injected by JS) ---- */
  var DICT = {
    ko: {
      'lang.name': '한국어', 'lang.other': 'English',
      'nav.home': '홈', 'nav.structure': '구조 특징', 'nav.game': '기공 게임', 'nav.report': '보고서',
      'footer.text': '© 2026 MOF Explorer · 고등학생을 위한 나노 과학 교육 플랫폼',
      'pwa.install': '📲 앱으로 설치', 'pwa.installStore': 'Google Play에서 앱으로 설치',
      'theme.toDark': '다크 모드로 전환', 'theme.toLight': '라이트 모드로 전환'
    },
    en: {
      'lang.name': 'English', 'lang.other': '한국어',
      'nav.home': 'Home', 'nav.structure': 'Structures', 'nav.game': 'Pore Game', 'nav.report': 'Report',
      'footer.text': '© 2026 MOF Explorer · A nano-science learning platform for high-schoolers',
      'pwa.install': '📲 Install app', 'pwa.installStore': 'Install from Google Play',
      'theme.toDark': 'Switch to dark mode', 'theme.toLight': 'Switch to light mode'
    }
  };

  /* ---- Body text: Korean → English (high-school friendly).
     Keys are matched against a text node / attribute after collapsing
     runs of whitespace. "MOF" stays "MOF"; the material class in
     general becomes the plural "MOFs" on the English side. ---- */
  var KO2EN = {
    // ---------- index.html ----------
    "MOF Explorer — 나노 세계로의 탐험": "MOF Explorer — A Journey into the Nano World",
    "나노 세계의 문을 열다": "Opening the door to the nano world",
    "금속 이온과 유기 분자가 결합해 만드는 무한한 3차원 다공성 결정. MOF Explorer에서 분자 구조의 비밀, 기공의 마법, 그리고 미래 응용 기술을 직접 체험해 보세요.": "Endless 3D porous crystals built by joining metal ions and organic molecules. In MOF Explorer, experience the secrets of molecular structure, the magic of pores, and future applications for yourself.",
    "🔬 구조 탐험 시작": "🔬 Start exploring",
    "🎮 기공 찾기 게임": "🎮 Pore-finding game",
    "SCROLL · 탐험 시작하기": "SCROLL · Start exploring",
    "알려진 MOF 구조": "Known MOFs",
    "1g당 최대 비표면적": "Max surface area per gram",
    "HKUST-1 기공 크기": "HKUST-1 pore size",
    "다공성 결정 구조": "Porous crystal structure",
    "학습 모듈": "Learning modules",
    "3가지 방식으로 MOF의 세계를 탐험하세요": "Explore the world of MOFs in three ways",
    "분자 구조 특징": "Molecular structure features",
    "MOF의 정의와 4대 핵심 특징을 인터랙티브 다이어그램으로 학습합니다.": "Learn what a MOF is and its 4 key features through interactive diagrams.",
    "SVG 시각화": "SVG visuals",
    "기공 슬라이더": "Pore slider",
    "HKUST-1 기공 게임": "HKUST-1 pore game",
    "격자 구조 속에 숨겨진 기공을 찾아 맞히는 4가지 모드의 챌린지 게임.": "A 4-mode challenge where you hunt for pores hidden in the lattice.",
    "랭킹": "Leaderboard",
    "타임 챌린지": "Time challenge",
    "조사 보고서": "Research report",
    "관심 MOF를 골라 보고서를 작성하고, AI 첨삭으로 글을 다듬어 PDF로 저장하세요.": "Pick a MOF you like, write a report, polish it with AI feedback, and save it as a PDF.",
    "AI 첨삭": "AI feedback",
    "PDF 저장": "Save as PDF",

    // ---------- structure.html ----------
    "MOF 분자 구조 특징 — MOF Explorer": "MOF Structure Features — MOF Explorer",
    "MOF 분자 구조 특징": "MOF Structure Features",
    "금속 노드와 유기 리간드가 만드는 무한한 나노 구조의 세계": "The endless nano world built by metal nodes and organic linkers",
    "MOF란?": "What is a MOF?",
    "기공 구조": "Pore structure",
    "비표면적": "Surface area",
    "응용 분야": "Applications",
    "MOF 종류": "Types of MOFs",
    "① MOF란 무엇인가?": "① What is a MOF?",
    "MOF(Metal-Organic Framework, 금속-유기 골격체)는 금속 이온 또는 클러스터(노드)와 유기 분자 링커(리간드)가 결합해 형성되는 3차원 다공성 결정 구조입니다.": "A MOF (Metal-Organic Framework) is a 3D porous crystal formed when metal ions or clusters (nodes) join with organic molecular linkers (ligands).",
    "MOF 종류와 단위 셀 개수": "MOF type and number of unit cells",
    "를 바꿔보며 기공이 어떻게 다른지 비교해보세요.": " — try changing them and see how the pores differ.",
    "MOF 선택": "Choose a MOF",
    "단위 셀 수": "Unit cells",
    "표시": "Show",
    "💎 기공": "💎 Pores",
    "🔗 결합": "🔗 Bonds",
    "🟡 사면체 기공": "🟡 Tetrahedral pore",
    "🟠 팔면체 기공": "🟠 Octahedral pore",
    "🔵 삼각형 창": "🔵 Triangular window",
    "🖱 드래그 · 휠 확대 · 더블클릭 자동회전": "🖱 Drag · scroll to zoom · double-click to auto-rotate",
    "↻ 리셋": "↻ Reset",
    "결정 구조 (CIF) 로딩 중...": "Loading crystal structure (CIF)...",
    "🔬 VESTA로 시각화된 HKUST-1 단위 셀": "🔬 HKUST-1 unit cell visualized with VESTA",
    "3D 모델에서": "In the 3D model, click a",
    "금속 노드": "metal node",
    "(주황·회색·시안),": "(orange · gray · cyan),",
    "유기 리간드 원자": "organic ligand atom",
    "또는": "or",
    "색상별 기공": "colored pore",
    "을 클릭하면": ",",
    "여기에 자세한 설명이 표시됩니다.": "and details will appear here.",
    "Cu²⁺, Zn²⁺ 같은 금속 이온이 구조의 모서리 역할을 합니다. 골격체의 강도와 화학적 성질을 결정합니다.": "Metal ions like Cu²⁺ and Zn²⁺ act as the corners of the structure. They set the framework's strength and chemistry.",
    "유기 리간드": "Organic ligand",
    "BTC, BDC 같은 다이카르복실산 분자가 금속 노드 사이를 연결하는 막대 역할을 합니다.": "Dicarboxylic-acid molecules like BTC and BDC act as rods that connect the metal nodes.",
    "기공 (Pore)": "Pore",
    "골격체 안에 생기는 규칙적인 빈 공간으로, 분자를 선택적으로 흡착·통과시킵니다.": "Regular empty spaces inside the framework that selectively adsorb molecules and let them pass through.",
    "② 기공 구조 — 분자 선택의 마법": "② Pore structure — the magic of molecular selection",
    "MOF의 기공은 매우 규칙적이고 균일합니다. 기공 크기에 따라 어떤 분자는 통과하고 어떤 분자는 막히는데, 이를": "MOF pores are very regular and uniform. Depending on pore size, some molecules pass and others are blocked — this is called the",
    "분자체(molecular sieve) 효과": "molecular sieve effect",
    "라고 합니다. 슬라이더로 기공 크기를 조절해 보세요.": ". Try adjusting the pore size with the slider.",
    "기공 크기 (지름)": "Pore size (diameter)",
    "2 Å (좁음) ←→ 30 Å (넓음)": "2 Å (narrow) ←→ 30 Å (wide)",
    "HKUST-1 큰 기공 크기": "HKUST-1 large pore size",
    "분자 통과 판정": "Pass / block result",
    "🔍 HKUST-1의 이중 기공": "🔍 HKUST-1's dual pores",
    "HKUST-1은 ~9 Å의 큰 기공과 ~5 Å의 작은 기공이 결합된 이중 기공 구조를 가져, 서로 다른 크기의 분자를 단계적으로 분리·저장할 수 있습니다.": "HKUST-1 has a dual-pore structure combining ~9 Å large pores and ~5 Å small pores, so it can separate and store molecules of different sizes step by step.",
    "③ 비표면적 — 1g에 축구장 면적": "③ Surface area — a soccer field in one gram",
    "비표면적(specific surface area)이란 1g의 물질이 가지는 표면적입니다. MOF는 다른 다공성 재료보다 압도적으로 높은 비표면적을 가집니다.": "Specific surface area is the surface area in 1 g of a material. MOFs have far higher surface areas than other porous materials.",
    "최대 비표면적 (m²/g)": "Max surface area (m²/g)",
    "알려진 MOF 종류": "Known MOF types",
    "결정 내 빈 공간 비율": "Empty-space fraction in the crystal",
    "💡 왜 비표면적이 중요할까?": "💡 Why does surface area matter?",
    "분자 흡착·촉매 반응은 모두": "Adsorption and catalysis all happen on the",
    "표면": "surface",
    "에서 일어납니다. 비표면적이 클수록 한정된 부피에 더 많은 가스를 저장하거나 더 빠른 반응을 일으킬 수 있어, 수소·CO₂ 저장과 같은 응용에 직접적으로 영향을 줍니다.": ". The larger the surface area, the more gas you can store in a limited volume and the faster reactions can run — which directly helps applications like hydrogen and CO₂ storage.",
    "④ 응용 분야": "④ Applications",
    "MOF는 구조와 화학적 성질을 자유롭게 설계할 수 있어 가스 저장, 약물 전달, 촉매, 센서 등 여러 분야에서 차세대 소재로 주목받고 있습니다. 카드를 클릭해 자세한 사례를 확인해보세요.": "Because you can freely design a MOF's structure and chemistry, MOFs are drawing attention as next-generation materials for gas storage, drug delivery, catalysis, sensors, and more. Click a card to see detailed examples.",
    "가스 저장 / 분리": "Gas storage / separation",
    "수소·메탄·CO₂를 안전하게 저장하고 분리합니다.": "Safely store and separate hydrogen, methane, and CO₂.",
    "는 ~3,800 m²/g의 비표면적으로 수소 저장 연구의 기준이 되었고,": " became a benchmark for hydrogen-storage research with its ~3,800 m²/g surface area, and",
    "은 CO₂ 포집과 자동차용 천연가스 저장에 응용되고 있습니다. 기공 크기를 미세하게 조정해 특정 가스만 선택적으로 흡착하는 기술도 활발히 개발 중입니다.": " is used for CO₂ capture and natural-gas storage for vehicles. Fine-tuning pore size to adsorb only certain gases is also being actively developed.",
    "약물 전달": "Drug delivery",
    "큰 기공에 약물을 담아 표적 전달합니다.": "Load drugs into large pores for targeted delivery.",
    "은 ~29 Å에 달하는 초대형 기공을 가지고 있어 진통제 이부프로펜, 항암제 등 큰 분자 약물을 효율적으로 담을 수 있습니다. 체내 특정 부위에서만 약물을 방출하는 표적 전달 시스템 연구가 진행되고 있습니다.": " has huge pores up to ~29 Å, so it can efficiently hold large-molecule drugs like the painkiller ibuprofen and anticancer agents. Researchers are developing targeted delivery that releases drugs only at specific spots in the body.",
    "촉매 / 에너지 저장": "Catalysis / energy storage",
    "반응 표면이 넓어 촉매·슈퍼캐패시터에 유리합니다.": "Their large reactive surface helps catalysts and supercapacitors.",
    "금속 노드를 활성점으로 활용하면 다양한 유기 반응의 촉매로 사용할 수 있고, 전기 전도성을 띄는 MOF는 슈퍼캐패시터·배터리 전극 재료로도 연구되고 있습니다.": "Using metal nodes as active sites, MOFs can catalyze many organic reactions, and electrically conductive MOFs are also studied as supercapacitor and battery electrode materials.",
    "은 열적·화학적 안정성이 뛰어나 산업용 촉매 후보로 주목받습니다.": " has excellent thermal and chemical stability, making it a strong candidate for industrial catalysts.",
    "환경 / 센서": "Environment / sensors",
    "유해 가스 감지와 수질 정화에 활용됩니다.": "Used to detect harmful gases and clean up water.",
    "은 형광 변화로 휘발성 유기 화합물(VOC)을 감지할 수 있고, 중금속 이온을 흡착해 오염된 물에서 제거하는 환경 정화 연구에도 사용됩니다. 제올라이트와 유사한 구조라 열·화학적 안정성이 매우 뛰어납니다.": " can detect volatile organic compounds (VOCs) through fluorescence changes, and is used in cleanup research that adsorbs heavy-metal ions to remove them from polluted water. Its zeolite-like structure makes it very stable thermally and chemically.",
    "⑤ 주요 MOF 종류": "⑤ Major MOF types",
    "대표적인 5종의 MOF를 비교해 보세요. 필터를 사용해 응용 분야별로 좁혀볼 수 있습니다.": "Compare representative MOFs. Use the filters to narrow them down by application.",
    "전체": "All",
    "가스 저장": "Gas storage",
    "고안정성": "High stability",
    "구리 노드와 BTC 리간드로 이루어진 대표적인 MOF로, 9 Å / 5 Å 이중 기공 구조를 가집니다. 1999년 보고 이후 MOF 연구의 출발점이 되었습니다.": "A classic MOF of copper nodes and BTC ligands with a 9 Å / 5 Å dual-pore structure. Since its 1999 report it has been a starting point for MOF research.",
    "CO₂ 포집": "CO₂ capture",
    "촉매": "Catalysis",
    "아연 산화 클러스터와 BDC 리간드로 이루어진 입방체 구조. ~3,800 m²/g의 비표면적으로 수소 저장 연구의 기준이 됩니다.": "A cubic structure of zinc-oxide clusters and BDC ligands. Its ~3,800 m²/g surface area makes it a benchmark for hydrogen-storage research.",
    "수소 저장": "Hydrogen storage",
    "에너지": "Energy",
    "제올라이트와 유사한 구조의 아연 이미다졸레이트 골격체. 열적·화학적 안정성이 매우 뛰어나며, 가스 분리막과 센서에 응용됩니다.": "A zinc-imidazolate framework with a zeolite-like structure. Very stable thermally and chemically, used in gas-separation membranes and sensors.",
    "분리막": "Membranes",
    "센서": "Sensors",
    "~29 Å의 초대형 기공을 가진 크롬계 MOF. 약물 전달 시스템과 큰 분자 흡착 연구에서 활발히 사용됩니다.": "A chromium-based MOF with huge ~29 Å pores. Widely used in drug-delivery systems and large-molecule adsorption research.",
    "대형 분자": "Large molecules",
    "지르코늄 클러스터 기반의 골격체로 열·물·산 모두에 강한 안정성을 보입니다. 산업용 촉매와 환경 정화에 적합합니다.": "A zirconium-cluster framework that resists heat, water, and acid. Well suited for industrial catalysis and environmental cleanup.",
    "환경 정화": "Environmental cleanup",
    "🎮 HKUST-1 기공 게임으로 →": "🎮 To the HKUST-1 pore game →",
    "← 이전": "← Previous",
    "다음 →": "Next →",
    "카메라 위치 초기화": "Reset camera position",

    // ---------- game.html (static UI) ----------
    "MOF 학습 게임 — MOF Explorer": "MOF Learning Games — MOF Explorer",
    "🎮 MOF 학습 게임": "🎮 MOF Learning Games",
    "3D 결정 구조 탐험부터 개념 퀴즈·기체 흡착 시뮬레이션·용어 매칭까지 — 다섯 가지 방식으로": "From exploring 3D crystals to concept quizzes, gas-adsorption sims, and term matching — learn",
    "MOF의 세계": "the world of MOFs",
    "를 익혀보세요.": " in five different ways.",
    "— 5가지 학습 게임 —": "— 5 learning games —",
    "3D 기공 헌트": "3D Pore Hunt",
    "2×2×2 슈퍼셀": "2×2×2 supercell",
    "실제 CIF 구조에서": "In a real CIF structure,",
    "색상별 기공을 클릭으로 찾기": "click to find pores by color",
    "MOF 탐정": "MOF Detective",
    "3D 구조 5문제": "5 questions on 3D structures",
    "금속 노드·리간드 단서로": "Using metal-node and ligand clues,",
    "MOF 종류 맞히기": "guess the MOF",
    "MOF 개념 마스터": "MOF Concept Master",
    "OX 10 + 4지선다 10 풀에서": "From a pool of 10 true/false + 10 multiple-choice,",
    "10문제 랜덤 출제": "10 random questions",
    "빠른 정답 보너스 (+5점)": "Fast-answer bonus (+5 pts)",
    "기체 분리 실험실": "Gas Separation Lab",
    "MOF 5종 시나리오": "5 MOF scenarios",
    "가장 잘 흡착되는 기체 선택": "Pick the best-adsorbed gas",
    "정답 +20점, 힌트 −5점": "Correct +20 pts, hint −5 pts",
    "MOF 플래시카드": "MOF Flashcards",
    "용어-설명 매칭": "Match terms to definitions",
    "초급·중급·심화 3세트": "3 sets: beginner, intermediate, advanced",
    "오답수에 따라 별 1~3개": "1–3 stars based on mistakes",
    "초기화": "Reset",
    "탐험가 이름": "Explorer name",
    "모드: -": "Mode: -",
    "← 뒤로": "← Back",
    "게임 시작 →": "Start game →",
    "진행": "Progress",
    "남은 시간": "Time left",
    "나가기": "Quit",
    "OX 문제": "True / False",
    "문제를 불러오는 중...": "Loading question...",
    "라운드": "Round",
    "💡 힌트 (-5점)": "💡 Hint (−5 pts)",
    "정보 로딩 중...": "Loading info...",
    "💧 이 MOF에 가장 잘 흡착될 기체는?": "💧 Which gas will this MOF adsorb best?",
    "초급 (1/3)": "Beginner (1/3)",
    "난이도": "Difficulty",
    "오답": "Wrong",
    "🃏 왼쪽": "🃏 On the left, click a",
    "용어 카드": "term card",
    "를 먼저 클릭한 뒤, 오른쪽에서 알맞은": "first, then on the right pick the matching",
    "설명 카드": "definition card",
    "를 골라 짝지으세요.": " to pair them.",
    "📚 용어": "📚 Terms",
    "📖 설명": "📖 Definitions",
    "남은 기공": "Pores left",
    "🖱 회전 · 휠 확대 ·": "🖱 Rotate · scroll to zoom ·",
    "빈 공간을 클릭해 기공 찾기!": "click empty space to find pores!",
    "3D 구조 준비 중...": "Preparing 3D structure...",
    "💡 색상이 다른 기공은 크기가 다릅니다. 큰 기공일수록 보너스 점수!": "💡 Different colors mean different pore sizes. Bigger pores = bonus points!",
    "🔬 구조를 회전시키며 관찰하세요": "🔬 Rotate the structure to observe it",
    "다음 문제 준비 중...": "Preparing next question...",
    "완벽한 탐험가!": "Perfect explorer!",
    "최종 점수": "Final score",
    "정확도": "Accuracy",
    "소요 시간": "Time taken",
    "랭킹 등록": "Submit score",
    "같은 모드 다시": "Play same mode again",
    "📝 보고서 쓰러 가기": "📝 Go write a report",
    "모드 선택": "Choose a mode",
    "이름을 입력하세요": "Enter your name",
    "사운드 토글": "Toggle sound",
    "사운드 켜기/끄기": "Sound on / off",
    "게임 나가기": "Quit game",
    "랭킹에 등록할 이름": "Name for the leaderboard",

    // ---------- report.html ----------
    "MOF 조사 보고서 — MOF Explorer": "MOF Research Report — MOF Explorer",
    "MOF 조사 보고서": "MOF Research Report",
    "관심 MOF를 선택해 보고서를 작성하고, AI 첨삭으로 글을 다듬어 PDF로 저장하세요.": "Choose a MOF you like, write a report, polish it with AI feedback, and save it as a PDF.",
    "1단계 · 기본 정보": "Step 1 · Basic info",
    "탐험을 시작하기 전에 보고서 기본 정보를 입력하고 조사할 MOF를 선택하세요.": "Before you start, fill in the report basics and choose a MOF to study.",
    "이름": "Name",
    "학번": "Student ID",
    "작성일": "Date",
    "조사할 MOF 선택": "Choose a MOF to study",
    "이중 기공 / CO₂ 흡착": "Dual pores / CO₂ adsorption",
    "초고비표면적 / 수소 저장": "Ultra-high surface area / hydrogen storage",
    "고안정성 / 분리막": "High stability / membranes",
    "초대형 기공 / 약물 전달": "Huge pores / drug delivery",
    "최고 안정성 / 촉매": "Top stability / catalysis",
    "📊 참고 데이터": "📊 Reference data",
    "2단계 · 구조 특징": "Step 2 · Structure features",
    "선택한 MOF의 구조 정보를 입력하고, 자신의 언어로 특징을 설명해보세요.": "Enter the chosen MOF's structure info and describe its features in your own words.",
    "화학식": "Formula",
    "발견/합성 연도": "Year discovered / synthesized",
    "구성 금속 이온": "Metal ion(s)",
    "기공 크기 (Å)": "Pore size (Å)",
    "비표면적 (m²/g)": "Surface area (m²/g)",
    "구조 특징 설명 (150자 이상 권장)": "Describe the structure (150+ characters recommended)",
    "0 / 150자": "0 / 150 chars",
    "3단계 · 응용 분야": "Step 3 · Applications",
    "이 MOF가 어디에 활용되는지, 그리고 장단점을 정리해보세요.": "Summarize where this MOF is used, and its pros and cons.",
    "응용 분야 (해당하는 항목을 모두 선택)": "Applications (select all that apply)",
    "촉매 반응": "Catalysis",
    "에너지 저장": "Energy storage",
    "주요 응용 사례 설명 (100자 이상 권장)": "Describe key uses (100+ characters recommended)",
    "0 / 100자": "0 / 100 chars",
    "장점 (80자 이상)": "Strengths (80+ characters)",
    "0 / 80자": "0 / 80 chars",
    "단점·한계 (80자 이상)": "Weaknesses / limits (80+ characters)",
    "참고 문헌 (한 줄에 하나씩, 2개 이상)": "References (one per line, 2 or more)",
    "AI 첨삭 받기 →": "Get AI feedback →",
    "4단계 · AI 첨삭": "Step 4 · AI feedback",
    "고등학교 화학 선생님 역할의 AI가 보고서를 분석해 점수와 개선점을 제안합니다.": "An AI acting as a high-school chemistry teacher reviews your report and suggests a score and improvements.",
    "AI 첨삭 준비 완료": "AI feedback ready",
    "지금까지 입력한 내용을 바탕으로 AI가 보고서의 완성도·정확도·서술 깊이를 평가하고, 보완할 점을 알려드립니다.": "Based on what you've written so far, the AI rates your report's completeness, accuracy, and depth, and tells you what to improve.",
    "✨ AI 첨삭 시작하기": "✨ Start AI feedback",
    "보고서를 분석하는 중이에요...": "Analyzing your report...",
    "보고서 미리보기 →": "Preview report →",
    "5단계 · 미리보기 & 저장": "Step 5 · Preview & save",
    "보고서 최종본을 미리 확인하고 \"PDF로 저장\" 버튼으로 인쇄/저장하세요.": "Check the final report, then use the \"Save as PDF\" button to print or save it.",
    "💾 서버에 저장": "💾 Save to server",
    "백엔드 SQLite DB에 보고서를 영구 저장합니다. 저장된 보고서는 선생님이 모아볼 수 있어요.": "Permanently saves your report to the backend SQLite database. Saved reports can be collected by your teacher.",
    "📤 서버에 제출하기": "📤 Submit to server",
    "전체 초기화": "Reset all",
    "🖨 PDF로 저장 / 인쇄": "🖨 Save as PDF / Print",
    "보고서 관련 궁금한 점을 물어보세요!": "Ask anything about your report!",
    "💬 MOF 질문하기": "💬 Ask about MOFs",
    "보고서 관련 궁금한 점을 물어보세요": "Ask anything about your report",
    "이 MOF에 대해 궁금한 걸 물어보세요.": "Ask anything you're curious about for this MOF.",
    "기공 크기가 왜 이렇게 정해졌어?": "Why is the pore size what it is?",
    "관련된 최신 연구가 있어?": "Is there any recent research on this?",
    "이 리간드는 왜 이런 구조야?": "Why does this ligand have this shape?",
    "MOF·화학 관련 질문만 답할 수 있어요. 보고서 문장은 직접 작성해야 해요.": "I can only answer MOF / chemistry questions. You need to write the report sentences yourself.",
    "홍길동": "e.g. Jane Doe",
    "예: Cu₃(BTC)₂": "e.g. Cu₃(BTC)₂",
    "예: 구리 (Cu²⁺)": "e.g. Copper (Cu²⁺)",
    "예: BTC (벤젠트리카르복실산)": "e.g. BTC (benzenetricarboxylic acid)",
    "예: 9 / 5": "e.g. 9 / 5",
    "예: ~1,500": "e.g. ~1,500",
    "이 MOF의 결정 구조, 노드-리간드 연결 방식, 기공의 모양 등을 자신의 언어로 설명해보세요.": "Describe this MOF's crystal structure, how the nodes and ligands connect, the pore shapes, and more — in your own words.",
    "구체적인 응용 예시와 그 원리를 적어보세요.": "Write specific example uses and how they work.",
    "이 MOF만의 강점은 무엇인가요?": "What are this MOF's unique strengths?",
    "어떤 한계가 있고, 어떻게 보완할 수 있을까요?": "What are its limits, and how could they be improved?",
    "예: Chui et al., Science 1999, 283, 1148-1150 https://en.wikipedia.org/wiki/Metal%E2%80%93organic_framework": "e.g. Chui et al., Science 1999, 283, 1148-1150 (one reference per line)",
    "닫기": "Close",
    "MOF 질문 챗봇 열기": "Open the MOF Q&A chatbot",
    "궁금한 점을 입력하세요": "Type your question",
    "보내기": "Send"
  };

  var current = DEFAULT;

  function detect() {
    try { var s = localStorage.getItem(STORAGE_KEY); if (s && DICT[s]) return s; } catch (e) {}
    var nav = (navigator.language || navigator.userLanguage || 'ko').toLowerCase();
    return nav.indexOf('ko') === 0 ? 'ko' : 'en';
  }

  function t(key) {
    var d = DICT[current] || DICT[DEFAULT];
    if (d[key] != null) return d[key];
    return (DICT[DEFAULT][key] != null) ? DICT[DEFAULT][key] : key;
  }

  /* ---- data-i18n layer (nav / footer) ---- */
  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    root.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (p) {
        var kv = p.split(':'); if (kv.length === 2) el.setAttribute(kv[0].trim(), t(kv[1].trim()));
      });
    });
    document.documentElement.setAttribute('lang', current);
    var btn = document.getElementById('langToggle'); if (btn) btn.textContent = t('lang.other');
  }

  /* ---- body dictionary layer (page text without editing HTML) ---- */
  var HANGUL = /[가-힣]/;
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var textOrig = new Map();   // Text node -> original string
  var attrOrig = new Map();   // Element -> { attr: original string }
  var observer = null;

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }

  function trText(tn) {
    var raw = tn.nodeValue;
    if (!raw || !HANGUL.test(raw)) return;
    var en = KO2EN[norm(raw)];
    if (en == null) return;
    if (!textOrig.has(tn)) textOrig.set(tn, raw);
    var lead = (raw.match(/^\s*/) || [''])[0];
    var trail = (raw.match(/\s*$/) || [''])[0];
    tn.nodeValue = lead + en + trail;
  }
  function trAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (el.hasAttribute && el.hasAttribute(a)) {
        var raw = el.getAttribute(a);
        if (!HANGUL.test(raw)) continue;
        var en = KO2EN[norm(raw)];
        if (en == null) continue;
        var store = attrOrig.get(el) || {};
        if (store[a] === undefined) { store[a] = raw; attrOrig.set(el, store); }
        el.setAttribute(a, en);
      }
    }
  }
  function walk(node) {
    if (node.nodeType === 3) { trText(node); return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') { trAttrs(node); return; }
    trAttrs(node);
    for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
  }
  function bodyApply(root) { walk(root || document.documentElement); }
  function bodyRestore() {
    textOrig.forEach(function (orig, tn) { try { tn.nodeValue = orig; } catch (e) {} });
    textOrig = new Map();
    attrOrig.forEach(function (store, el) { for (var a in store) { try { el.setAttribute(a, store[a]); } catch (e) {} } });
    attrOrig = new Map();
  }
  function startObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(function (muts) {
      if (current !== 'en') return;
      for (var i = 0; i < muts.length; i++) {
        var add = muts[i].addedNodes; if (!add) continue;
        for (var j = 0; j < add.length; j++) walk(add[j]);
      }
    });
    try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  }

  /* ---- orchestration ---- */
  function render() {
    apply();                                   // nav / footer via data-i18n
    if (current === 'en') bodyApply(); else bodyRestore();   // page body
    document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: current } }));
  }
  function setLang(lang) {
    if (!DICT[lang]) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    render();
  }
  function toggle() { setLang(current === 'ko' ? 'en' : 'ko'); }

  function init() {
    current = detect();
    startObserver();
    var btn = document.getElementById('langToggle');
    if (btn && !btn._i18nBound) { btn.addEventListener('click', toggle); btn._i18nBound = true; }
    render();
  }

  window.I18N = {
    init: init, apply: apply, t: t, setLang: setLang, toggle: toggle,
    get lang() { return current; }, DICT: DICT, KO2EN: KO2EN
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
