/*
 * Abu Prompt — grounded knowledge companion
 * Vanilla JS. No dependencies.
 *
 * 1. Floating launcher + accessible slide-over drawer
 *    (role=dialog, aria-modal, Escape to close, focus restore + Tab trap)
 * 2. Dynamic 5-state character header
 *    (GREETING → IDLE → THINKING 600ms → EXPLAINING / UNCERTAIN, crossfading
 *    the five images in images/abu/)
 * 3. Grounded knowledge engine — explicit Abu architecture routing followed by
 *    keyword-scored intents over verified portfolio data, citation pills that
 *    smooth-scroll to sections, and a fail-closed UNCERTAIN state.
 *
 * To add a knowledge entry: push to KB below with
 * { keys: [...], text: 'answer', cites: [['Label', '#anchor'], ...] }.
 * Off-topic coding tasks fail closed first; explicit architecture asks then
 * win over topic guards. Known out-of-scope topics and empty scores also fall
 * through to UNCERTAIN.
 */
(function () {
  'use strict';

  var drawer = document.getElementById('abu-drawer');
  if (!drawer) return;

  var backdrop = document.getElementById('abu-backdrop');
  var launcher = document.getElementById('abu-launcher');
  var stateMsg = document.getElementById('abu-state-msg');
  var msgs = document.getElementById('abu-msgs');
  var form = document.getElementById('abu-form');
  var input = document.getElementById('abu-input');
  var stageImgs = document.querySelectorAll('[data-abu-state]');

  var FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  /* ================= 5-STATE CHARACTER HEADER ================= */

  var STATES = {
    greeting: 'Welcome! Ask me about Alaa\'s projects, architecture decisions, or the original ' +
      'PersonalBrandingAgent RAG + SQLite codebase.',
    idle: 'Listening — pick a prompt chip or type a question.',
    thinking: 'Matching your question against verified portfolio evidence...',
    explaining: 'Grounded response matched to verified portfolio & repository facts.',
    uncertain: 'Out of verified scope — deterministic guardrail active.'
  };

  var GREETING_HOLD_MS = 2200;
  var THINKING_MS = 600;

  var state = 'greeting';
  var greetTimer = null;
  var thinkTimer = null;
  var lastOpener = null;
  var pending = false;

  function setState(name) {
    state = name;
    for (var i = 0; i < stageImgs.length; i++) {
      var img = stageImgs[i];
      img.classList.toggle('active', img.getAttribute('data-abu-state') === name);
    }
    if (stateMsg) stateMsg.textContent = STATES[name];
    drawer.setAttribute('aria-busy', name === 'thinking' ? 'true' : 'false');
    if (input) input.disabled = name === 'thinking';
  }

  /* ================= GROUNDED KNOWLEDGE ENGINE ================= */

  var UNCERTAIN = {
    text: 'Out of verified scope — deterministic guardrail active. My knowledge base covers only Alaa\'s ' +
      'verified portfolio and GitHub specs; I won\'t guess beyond them — that is the same fail-closed ' +
      'philosophy his systems ship with.',
    suggests: [
      'How are you (Abu Prompt) architected?',
      'How did Alaa achieve 130/130 RAG citations?',
      'What makes Quizey concurrency-safe?'
    ]
  };

  var ARCHITECTURE_TERMS = [
    'architecture', 'architected', 'built', 'codebase', 'source code', 'technical design',
    'tech stack', 'rag pipeline', 'under the hood', 'internals', 'implementation',
    'chroma', 'sqlite', 'retrieval', 'bm25', 'rrf', 'embedding', 'embeddings',
    'migration', 'migrations', 'scheduler', 'workflow', 'state'
  ];

  var ABU_REFERENCES = ['abu prompt', 'abu', 'personalbrandingagent', 'branding agent'];

  var SELF_ARCHITECTURE_PHRASES = [
    'your architecture', 'your own architecture', 'your codebase', 'your own codebase',
    'your source code', 'your technical design', 'your tech stack', 'your rag pipeline',
    'your rag', 'your retrieval', 'your sqlite', 'your chroma',
    'are you architected', 'how are you built', 'how were you built',
    'how does abu prompt work', 'how does personalbrandingagent work',
    'how do you retrieve', 'how do you store state', 'do you use rag', 'are you using rag',
    'what powers you', 'what powers abu', 'personalbrandingagent'
  ];

  var COMPANION_REFERENCES = ['portfolio assistant', 'this assistant', 'this chat', 'browser companion'];
  var COMPANION_IMPLEMENTATION_TERMS = [
    'work', 'works', 'implemented', 'implementation', 'route', 'routes', 'routing',
    'runtime', 'use rag', 'using rag', 'live rag'
  ];

  var EDUCATION_TERMS = [
    'education', 'academic', 'academic background', 'degree', 'bachelor', 'bachelors',
    'b s', 'management information systems', 'mis', 'modern academy', 'university',
    'college', 'study', 'studied', 'certificate', 'certificates', 'certification',
    'certifications', 'credential', 'credentials', 'course', 'courses', 'coursera',
    'ibm', 'packt', 'vanderbilt', 'manara', 'training', 'bootcamp',
    'system design certificate', 'devops training'
  ];

  var DEPLOYMENT_TERMS = [
    'deployment', 'deployments', 'deploy', 'deployed', 'docker', 'docker compose',
    'container', 'containers', 'containerized', 'containerised', 'containerization',
    'containerisation', 'kubernetes', 'devops'
  ];

  var CLINICAL_RAG_TERMS = [
    'ng217', 'nice', 'clinical rag', 'grounded clinical rag', 'clinical guideline'
  ];

  var QUIZEY_TERMS = ['quizey'];

  var SKILL_CONTEXT_TERMS = ['skills', 'stack', 'technologies', 'technology', 'does alaa know', 'alaa use'];

  var COMPANION_IDENTITY_PHRASES = [
    'who are you', 'what are you', 'what is abu prompt', 'who is abu prompt',
    'tell me about abu prompt', 'your name'
  ];

  var OUT_OF_SCOPE_TERMS = [
    'weather', 'forecast', 'temperature',
    'joke', 'jokes', 'poem', 'poetry', 'riddle',
    'recipe', 'recipes', 'restaurant', 'restaurants', 'cooking', 'food',
    'translate', 'translation',
    'stock', 'stocks', 'crypto', 'bitcoin',
    'election', 'elections', 'politics', 'political',
    'football', 'soccer', 'basketball', 'tennis', 'cricket',
    'movie', 'movies', 'netflix', 'song', 'songs', 'lyrics',
    'horoscope', 'zodiac', 'celebrity', 'gossip', 'lottery', 'gambling',
    'internet', 'news', 'current events', 'current time', 'time is it', 'time now', 'who will win'
  ];

  var CODING_REQUEST_ACTIONS = [
    'write', 'writing', 'build', 'building', 'create', 'creating', 'make', 'making',
    'implement', 'implementing', 'code', 'coding', 'generate', 'generating',
    'develop', 'developing', 'debug', 'debugging', 'fix', 'fixing', 'solve', 'solving',
    'scrape', 'scraping', 'explain', 'explaining', 'deploy', 'deploying',
    'containerize', 'containerizing', 'containerise', 'containerising',
    'review', 'reviewing', 'refactor', 'refactoring', 'test', 'testing'
  ];

  var CODING_REQUEST_TARGETS = [
    'web scraper', 'scraper', 'scraping', 'calculator', 'script', 'program',
    'programming task', 'programming tasks', 'programming problem', 'programming problems',
    'coding task', 'coding tasks', 'coding problem', 'coding problems',
    'code', 'function', 'class', 'algorithm', 'decorator',
    'app', 'application', 'website', 'api', 'endpoint', 'bot', 'automation',
    'utility', 'tool', 'leetcode', 'homework', 'python', 'javascript', 'typescript',
    'java', 'sql', 'fastapi', 'flask', 'react', 'langchain', 'docker', 'kubernetes'
  ];

  var CODING_REQUEST_MARKERS = [
    'can you', 'could you', 'would you', 'please', 'for me', 'help me',
    'write me', 'build me', 'create me', 'make me', 'solve this', 'fix this',
    'debug this', 'implement this', 'generate code'
  ];

  var CODING_IMPERATIVES = [
    'write', 'build', 'create', 'make', 'implement', 'code', 'generate', 'develop',
    'debug', 'fix', 'solve', 'scrape', 'explain', 'deploy', 'containerize',
    'containerise', 'review', 'refactor', 'test'
  ];

  var PORTFOLIO_CONTEXT_TERMS = [
    'alaa', 'abu prompt', 'abu', 'personalbrandingagent', 'quizey', 'ng217', 'nice',
    'clinical rag'
  ];

  var NON_CODING_WRITING_TERMS = [
    'summary', 'summarize', 'overview', 'description', 'bio', 'resume', 'cover letter'
  ];

  var PORTFOLIO_EXPLANATION_ACTIONS = ['explain', 'explaining', 'review', 'reviewing'];
  var CODE_REVIEW_MARKERS = ['this code', 'my code', 'code snippet', 'pull request'];

  var ABU_ARCHITECTURE = {
    text: 'The portfolio companion you are using is a dependency-free JavaScript intent router over verified ' +
      'answer templates. The original PersonalBrandingAgent behind Abu Prompt is a scheduled Python system: ' +
      'its curated core is version-controlled Markdown, with configurable chunking defaults of 1,000 ' +
      'characters and 200 overlap, local all-MiniLM-L6-v2 embeddings, and persistent Chroma storage. Generic ' +
      'retrieval fuses dense and BM25 ranks with Reciprocal Rank Fusion (k=60); scheduled branding instead ' +
      'builds a category-stratified 12-document evidence budget plus guidance. Operational state uses ' +
      'SQLite/WAL, forward-only migrations, and database constraints around workflow, intent, and publication ' +
      'state. Gemini model selection is configuration-driven and structured outputs are schema-enforced.',
    cites: [['Abu Prompt project', '#projects'], ['Engineering signature', '#signature'], ['Skills', '#skills']]
  };

  var COMPANION_IMPLEMENTATION = {
    text: 'This in-page companion is intentionally local and deterministic: dependency-free JavaScript ' +
      'normalizes each question, applies high-specificity intent and safety rules, and selects a verified ' +
      'answer template. It does not call Chroma, SQLite, Gemini, or any remote model in the browser. Those ' +
      'systems belong to the original scheduled PersonalBrandingAgent represented by Abu Prompt.',
    cites: [['Companion', '#hero'], ['Abu Prompt project', '#projects'], ['Engineering signature', '#signature']]
  };

  var DEPLOYMENT = {
    intent: 'deployment',
    keys: DEPLOYMENT_TERMS,
    text: 'Project 1 — Grounded Clinical RAG over NICE NG217 — has its FastAPI stack containerized with Docker ' +
      'and Docker Compose. The portfolio documents containerization, not a completed public production host ' +
      'or live deployment; production deployment and observability remain roadmap items. Docker/Compose and ' +
      'AWS EC2 are also listed in Alaa\'s DevOps skill set.',
    cites: [['Containerized RAG', '#projects'], ['DevOps skills', '#skills'], ['Deployment roadmap', '#vision']]
  };

  var KB = [
    DEPLOYMENT,
    {
      intent: 'abu-duplicates',
      keys: ['duplicate', 'duplicates', 'repost', 'overuse', 'publish', 'publishing', 'scheduled',
        'scheduler', 'autonomous', 'cron', 'double'],
      text: 'The active default workflow checks exact SHA-256 duplicates and 14-day topic, project, and ' +
        'evidence overuse. A cosine near-duplicate detector (threshold >= 0.90 over up to 50 records from the ' +
        'same 14-day window) exists in the codebase, but it is not active until an embedder is wired into ' +
        'production. SQLite ' +
        'enforces one non-failed intent per content hash and one publication per intent, while a per-workflow ' +
        'lock prevents overlapping branding invocations from entering together.',
      cites: [['Abu Prompt project', '#projects'], ['Engineering trade-offs', '#mind']]
    },
    {
      intent: 'abu-guardrails',
      keys: ['ungrounded', 'guardrail', 'guardrails', 'verification', 'verify', 'validation', 'evidence',
        'pre-publish', 'deterministic', 'provenance', 'gates'],
      text: 'Nothing ships until deterministic gates pass: citation exists, cited evidence available, evidence ' +
        'state strong enough, references validated — plus GUIDANCE_AS_EVIDENCE (positioning docs are guidance, ' +
        'not evidence) and the corpus\'s never-infer rules. Wording findings can revise; evidence and provenance ' +
        'failures reject. The advisory judge can request revision but cannot turn a deterministic failure into a ' +
        'pass or issue terminal rejection; publish still requires a deterministic verified result.',
      cites: [['Philosophy', '#philosophy'], ['Abu Prompt project', '#projects'],
        ['Engineering trade-offs', '#mind']]
    },
    {
      intent: 'clinical-rag',
      keys: ['130', 'citations', 'citation', 'ng217', 'nice', 'clinical', 'guideline',
        'grounded rag', 'clinical rag'],
      text: 'Project 1 is an end-to-end Grounded Clinical RAG system over NICE NG217: dense retrieval plus ' +
        'BM25 fused with RRF, cross-encoder reranking, LLM generation through FastAPI, and deterministic ' +
        'citation validation. Evaluation reports 85% Precision@1, 87.9% MRR, 100% candidate recall, 100% ' +
        'grounded responses, 130/130 traceable citations, and 75% answer correctness.',
      cites: [['Clinical RAG', '#projects'], ['Hackathon experience', '#experience'], ['Evaluation log', '#log']]
    },
    {
      intent: 'quizey',
      keys: ['quizey', 'exam', 'submission', 'submissions', 'submit', 'race', 'concurrency', 'concurrent',
        'idempotency', 'rbac', 'grading'],
      text: 'One-time submission is a database invariant: database-backed idempotency keys inside atomic ' +
        'transactions, frozen attempt papers, and copy-on-write exam versioning — correctness never depends on ' +
        'the client behaving itself. JWT revocation lives in Redis with expiration-aware TTLs and fails closed ' +
        'during cache outages. Race conditions and the fail-closed path itself are covered in the 1,100+ ' +
        'automated tests. AI features are planned for Phase 3; they are not in the current backend.',
      cites: [['Quizey case study', '#quizey'], ['Flagship projects', '#projects'], ['Builder\'s log', '#log']]
    },
    {
      intent: 'evaluation',
      keys: ['evaluation', 'evaluate', 'metrics', 'precision', 'mrr', 'harness', 'measured', 'judge'],
      text: 'A fixed evaluation harness, run before and after every change: retrieval — Precision@1, MRR, ' +
        'candidate recall; generation — Groundedness and Answer Correctness, with an advisory LLM-as-a-judge ' +
        'next to the deterministic checks. Baselines from the clinical pipeline: 85% P@1, 87.9% MRR, 75% ' +
        'Answer Correctness — improvements are numbers, not vibes.',
      cites: [['Signature experience', '#signature'], ['Builder\'s log', '#log']]
    },
    {
      intent: 'skills',
      keys: ['skills', 'stack', 'technologies', 'technology', 'fastapi', 'flask', 'langchain', 'python',
        'bm25', 'rrf', 'chroma', 'embedding', 'embeddings', 'reranking', 'sqlalchemy', 'sqlmodel',
        'pydantic', 'redis', 'mysql', 'postgresql', 'mongodb', 'sqlite', 'pytest', 'aws', 'ec2',
        'linux', 'git', 'github'],
      text: 'Four clusters: AI & RAG (hybrid dense + BM25 + RRF, cross-encoder reranking, Chroma, embeddings, ' +
        'prompt engineering, citation validation); agentic systems (LangChain, LangGraph, CrewAI, tool calling, ' +
        'ReAct, stateful workflows); backend (Python, FastAPI, Flask, SQLAlchemy, JWT & RBAC, Redis, ' +
        'MySQL/PostgreSQL, SQLite, atomic transactions, idempotency); reliability & DevOps (pytest, retrieval ' +
        'evaluation, deterministic validation, LLM-as-a-judge, Docker, AWS EC2, Linux, Git).',
      cites: [['Skills', '#skills']]
    },
    {
      intent: 'experience',
      keys: ['experience', 'hackathon', 'creativa', 'team lead', 'career', 'alx', 'worked'],
      text: 'Team Lead of a 5-person cross-functional team at the Creativa AI Hackathon — 40+ hours to a ' +
        'clinical RAG system on NICE NG217, owning architecture, the FastAPI backend, hybrid retrieval, and ' +
        'evaluation: 85% P@1, 87.9% MRR, 130/130 citations. Before that, ALX Africa\'s 12-month Software ' +
        'Engineering programme — nine months full-stack, three months backend — certified Sep 2024.',
      cites: [['Experience', '#experience'], ['Flagship projects', '#projects']]
    },
    {
      intent: 'education',
      keys: EDUCATION_TERMS,
      text: 'Academic background: B.S. in Management Information Systems from Modern Academy, Oct 2019 to ' +
        'Jul 2023. The portfolio features seven professional credential cards: six completed and the IBM RAG ' +
        'and Agentic AI Professional Certificate in progress (7/10 courses, expected Nov 2026). Completed ' +
        'featured credentials cover LangChain/LangGraph, DevOps, FastAPI/backend, Python agentic AI, system ' +
        'design, and ALX backend engineering; additional certificates and credentials are also listed.',
      cites: [['Education and certificates', '#certs']]
    },
    {
      intent: 'contact',
      keys: ['contact', 'hiring', 'hire', 'email', 'reach', 'resume', 'cv', 'phone', 'available'],
      text: 'Channels: alaabadawii404@gmail.com · +20 102 917 1634 · linkedin.com/in/alaabadawii · ' +
        'github.com/AlaaBadawii — and the resume PDF is one click away in the hero. Available for AI and ' +
        'backend roles; usually replies within 24 hours.',
      cites: [['Contact', '#contact'], ['Hero', '#hero']]
    },
    {
      intent: 'projects',
      keys: ['projects', 'project', 'flagship', 'flagships', 'portfolio'],
      text: 'Three flagships: (1) Grounded Clinical RAG over NICE NG217 — 85% P@1, 130/130 traceable ' +
        'citations, FastAPI + Docker; (2) Quizey — AI-first assessment platform, 1,100+ automated tests, ' +
        'idempotent grading, fail-closed auth; (3) Abu Prompt — the autonomous branding agent that became me: ' +
        'Chroma RAG, SQLite state, deterministic pre-publish guardrails, published end-to-end through LinkedIn.',
      cites: [['Flagship projects', '#projects'], ['Quizey case study', '#quizey']]
    },
    {
      intent: 'about',
      keys: ['alaa', 'badawii', 'who is alaa', 'about alaa'],
      text: 'Alaa Badawii — Software & AI Engineer in Cairo, Egypt: production-grade RAG pipelines, agentic ' +
        'systems, and high-reliability Python backends. Led a 5-person hackathon team to 130/130 clinical ' +
        'citations, is building Quizey\'s 1,100+ test backend, and ships autonomous agents — like me. ' +
        'Available for AI and backend roles.',
      cites: [['About', '#about'], ['Contact', '#contact']]
    },
    {
      intent: 'abu-identity',
      keys: ['who are you', 'what are you', 'what is abu prompt', 'who is abu prompt', 'your name', 'yourself'],
      text: 'I\'m Abu Prompt — born as Alaa\'s autonomous RAG branding agent (PersonalBrandingAgent), now the ' +
        'grounded knowledge companion for this portfolio. This browser companion is a deterministic JavaScript ' +
        'router; the original agent is the scheduled Python RAG system. I answer only from verified portfolio ' +
        'and repository facts; outside that scope I refuse rather than hallucinate.',
      cites: [['Flagship projects', '#projects'], ['Hero', '#hero']]
    },
    {
      intent: 'greeting',
      keys: ['hello', 'hi', 'hey', 'greetings', 'salam', 'thank you', 'thanks'],
      text: 'Welcome! Ask me about Alaa\'s projects, architecture decisions, metrics, or the original ' +
        'PersonalBrandingAgent RAG + SQLite codebase — every answer stays within verified portfolio and ' +
        'repository facts.',
      cites: [['Flagship projects', '#projects']]
    }
  ];

  function normalize(s) {
    return ' ' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  }

  function hasAny(padded, terms) {
    for (var i = 0; i < terms.length; i++) {
      var term = normalize(terms[i]).trim();
      if (term && padded.indexOf(' ' + term + ' ') !== -1) return true;
    }
    return false;
  }

  function startsWithAny(padded, terms) {
    var value = padded.trim();
    for (var i = 0; i < terms.length; i++) {
      var term = normalize(terms[i]).trim();
      if (value === term || value.indexOf(term + ' ') === 0) return true;
    }
    return false;
  }

  function asksForOffTopicCoding(padded) {
    if (hasAny(padded, NON_CODING_WRITING_TERMS)) return false;
    if (!hasAny(padded, CODING_REQUEST_ACTIONS) || !hasAny(padded, CODING_REQUEST_TARGETS)) return false;
    var hasPortfolioContext = hasAny(padded, PORTFOLIO_CONTEXT_TERMS);
    if (hasPortfolioContext && hasAny(padded, PORTFOLIO_EXPLANATION_ACTIONS) &&
      !hasAny(padded, CODE_REVIEW_MARKERS)) return false;
    return startsWithAny(padded, CODING_IMPERATIVES) ||
      hasAny(padded, CODING_REQUEST_MARKERS) ||
      !hasPortfolioContext;
  }

  function asksAboutCompanionImplementation(padded) {
    return hasAny(padded, COMPANION_REFERENCES) &&
      hasAny(padded, COMPANION_IMPLEMENTATION_TERMS);
  }

  function asksAboutAbuArchitecture(padded) {
    return hasAny(padded, SELF_ARCHITECTURE_PHRASES) ||
      (hasAny(padded, ABU_REFERENCES) && hasAny(padded, ARCHITECTURE_TERMS));
  }

  function entryForIntent(intent) {
    for (var i = 0; i < KB.length; i++) {
      if (KB[i].intent === intent) return KB[i];
    }
    return null;
  }

  function answerFor(question) {
    var padded = normalize(question);

    if (asksForOffTopicCoding(padded)) return null;
    if (hasAny(padded, EDUCATION_TERMS)) return entryForIntent('education');
    if (hasAny(padded, DEPLOYMENT_TERMS)) return DEPLOYMENT;
    if (hasAny(padded, QUIZEY_TERMS)) return entryForIntent('quizey');
    if (hasAny(padded, CLINICAL_RAG_TERMS)) return entryForIntent('clinical-rag');
    if (asksAboutCompanionImplementation(padded)) return COMPANION_IMPLEMENTATION;
    if (asksAboutAbuArchitecture(padded)) return ABU_ARCHITECTURE;
    if (hasAny(padded, COMPANION_IDENTITY_PHRASES)) return entryForIntent('abu-identity');
    if (hasAny(padded, OUT_OF_SCOPE_TERMS)) return null;
    if (hasAny(padded, SKILL_CONTEXT_TERMS)) return entryForIntent('skills');

    var best = null;
    var bestScore = 0;
    var tied = false;
    for (var i = 0; i < KB.length; i++) {
      var entry = KB[i];
      var score = 0;
      for (var k = 0; k < entry.keys.length; k++) {
        var key = normalize(entry.keys[k]).trim();
        if (key && padded.indexOf(' ' + key + ' ') !== -1) score += key.length;
      }
      if (score > bestScore) {
        best = entry;
        bestScore = score;
        tied = false;
      } else if (score > 0 && score === bestScore) {
        tied = true;
      }
    }
    return tied ? null : best;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function appendMsg(kind, bodyHtml) {
    if (!msgs) return;
    msgs.innerHTML += '<div class="abu-msg ' + kind + '">' + bodyHtml + '</div>';
    msgs.scrollTop = msgs.scrollHeight;
  }

  function renderUncertain() {
    setState('uncertain');
    var h = '<div class="abu-boundary">' + escapeHtml(UNCERTAIN.text) + '</div>' +
      '<div class="abu-suggests" role="group" aria-label="Verified questions Abu Prompt can answer">';
    for (var i = 0; i < UNCERTAIN.suggests.length; i++) {
      h += '<button type="button" class="abu-chip" data-abu-ask="' + escapeHtml(UNCERTAIN.suggests[i]) +
        '">' + escapeHtml(UNCERTAIN.suggests[i]) + '</button>';
    }
    appendMsg('bot uncertain', h + '</div>');
  }

  function deliver(question) {
    var res = answerFor(question);
    pending = false;
    if (!res) {
      renderUncertain();
      return;
    }
    setState('explaining');
    var b = escapeHtml(res.text) + '<div class="abu-cites">';
    for (var c = 0; c < res.cites.length; c++) {
      b += '<a class="abu-cite" href="' + res.cites[c][1] + '" data-abu-cite>' +
        escapeHtml(res.cites[c][0]) + '</a>';
    }
    appendMsg('bot', b + '</div>');
  }

  function ask(text) {
    text = String(text || '').trim();
    if (!text || pending) return;
    pending = true;
    clearTimeout(greetTimer);
    appendMsg('user', escapeHtml(text));
    setState('thinking');
    if (input) input.value = '';
    clearTimeout(thinkTimer);
    thinkTimer = setTimeout(function () {
      deliver(text);
    }, THINKING_MS);
  }

  /* ================= DRAWER OPEN / CLOSE (focus management) ================= */

  function openDrawer(opener) {
    lastOpener = opener || null;
    drawer.hidden = false;
    if (backdrop) backdrop.hidden = false;
    if (launcher) {
      launcher.hidden = true;
      launcher.setAttribute('aria-expanded', 'true');
    }
    if (lastOpener) lastOpener.setAttribute('aria-expanded', 'true');
    clearTimeout(greetTimer);
    if (pending) {
      setState('thinking');
      drawer.focus();
      return;
    }
    setState('greeting');
    if (input) input.focus();
    greetTimer = setTimeout(function () {
      if (state === 'greeting') setState('idle');
    }, GREETING_HOLD_MS);
  }

  function closeDrawer(restoreFocus) {
    if (restoreFocus === undefined) restoreFocus = true;
    drawer.hidden = true;
    if (backdrop) backdrop.hidden = true;
    if (launcher) {
      launcher.hidden = false;
      launcher.setAttribute('aria-expanded', 'false');
    }
    clearTimeout(greetTimer);
    if (lastOpener) lastOpener.setAttribute('aria-expanded', 'false');
    if (restoreFocus && lastOpener && typeof lastOpener.focus === 'function') lastOpener.focus();
    lastOpener = null;
  }

  function isOpen() {
    return !drawer.hidden;
  }

  function onKeydown(e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDrawer();
      return;
    }
    if (e.key === 'Tab') {
      var all = drawer.querySelectorAll(FOCUSABLE);
      var f = [];
      for (var i = 0; i < all.length; i++) {
        if (!all[i].disabled) f.push(all[i]);
      }
      if (!f.length) return;
      var first = f[0];
      var last = f[f.length - 1];
      var active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !drawer.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !drawer.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  document.addEventListener('click', function (e) {
    var openBtn = e.target.closest('[data-abu-open]');
    if (openBtn) {
      openDrawer(openBtn);
      return;
    }
    var askBtn = e.target.closest('[data-abu-ask]');
    if (askBtn) {
      var q = askBtn.getAttribute('data-abu-ask');
      if (!isOpen()) openDrawer(askBtn);
      ask(q);
      return;
    }
    var cite = e.target.closest('[data-abu-cite]');
    if (cite) {
      e.preventDefault();
      var href = cite.getAttribute('href') || '';
      if (href.charAt(0) === '#') {
        var target = document.getElementById(href.slice(1));
        if (target && target.scrollIntoView) {
          var reduce = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
          target.setAttribute('tabindex', '-1');
          if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState(null, '', href);
          }
          closeDrawer(false);
          target.focus({ preventScroll: true });
        } else {
          closeDrawer();
        }
      }
      return;
    }
    var closeBtn = e.target.closest('[data-abu-close]');
    if (closeBtn) closeDrawer();
  });

  document.addEventListener('keydown', onKeydown);

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ask(input ? input.value : '');
    });
  }

  if (input) {
    input.addEventListener('input', function () {
      if (pending) return;
      clearTimeout(greetTimer);
      if (state !== 'idle') setState('idle');
    });
  }
})();
