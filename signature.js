/*
 * Signature experience — The Engineering Behind the Intelligence
 * Vanilla JS. No dependencies.
 *
 * 1. "Inside My Engineering Mind" decision simulator  → SCENARIOS data + free-navigation state machine
 *    (prev/next between scenarios, skip without answering, change earlier answers, exit + resume)
 * 2. "The Builder's Log" filtering                    → static entries in index.html
 * 3. Chapter scrollspy for the signature nav           → IntersectionObserver
 *
 * To add a simulator scenario: append an object to SCENARIOS below.
 * Each option needs { text, correct, note }; each scenario needs
 * { context, situation, options, realWorld }.
 */
(function () {
  'use strict';

  /* ================= SIMULATOR SCENARIO DATA ================= */

  var SCENARIOS = [
    {
      context: 'Quizey — AI-first assessment platform · 1,100+ automated tests guard the exam lifecycle.',
      situation: 'A student hits Submit. The network times out, the client retries, and a second submission request arrives while the first transaction is still open. How do you guarantee the exam is graded exactly once?',
      options: [
        {
          text: 'Disable the submit button in the frontend after the first click',
          correct: false,
          note: 'The client is the least trustworthy layer — double tabs, flaky networks, and API retries all sail past a disabled button.'
        },
        {
          text: 'Guard the write with a database-backed idempotency key inside an atomic transaction',
          correct: true,
          note: 'Exactly-once behavior enforced in the database — the one layer every client has to go through.'
        },
        {
          text: 'Take a distributed lock in Redis and hope it holds',
          correct: false,
          note: 'A lock without transactional semantics still leaves a window, and it adds a new dependency that can fail exactly when you need it.'
        }
      ],
      realWorld: 'In Quizey, every submission carries a database-backed idempotency key. Atomic transactions and frozen attempt papers make one-time submission a database invariant — race conditions are covered explicitly in the test suite.'
    },
    {
      context: 'Quizey — JWT revocation is cached in Redis with expiration-aware TTLs.',
      situation: 'Redis goes down mid-deploy. A just-revoked admin token arrives at the API. What should the auth layer do?',
      options: [
        {
          text: 'Fail open — treat the cache as a soft hint and let the request through',
          correct: false,
          note: 'Availability feels safer, but a revoked token walking back in is exactly the attack the revocation list exists to stop.'
        },
        {
          text: 'Fail closed — reject requests you cannot verify while the cache is unreachable',
          correct: true,
          note: 'A few rejected requests are a small, recoverable cost. Honoring a revoked token is not.'
        },
        {
          text: 'Fall back to checking only the JWT\'s own expiry',
          correct: false,
          note: 'That ignores revocation entirely — the token stays locally valid until its TTL, which is the whole problem revocation solves.'
        }
      ],
      realWorld: 'Quizey\'s Redis-backed JWT revocation fails closed during cache outages, with expiration-aware TTLs — and the fail-closed path itself is covered by automated tests.'
    },
    {
      context: 'Clinical RAG over the NICE NG217 guideline — where a wrong citation is worse than no answer.',
      situation: 'The LLM produces a fluent clinical recommendation, but two of its claims don\'t map to any retrieved passage. The user is waiting. What happens next?',
      options: [
        {
          text: 'Ship it — the answer reads well and the model is usually right',
          correct: false,
          note: 'Fluency is not evidence. In a clinical context, an untraceable claim is a hallucination wearing a confident tone.'
        },
        {
          text: 'Block it at a deterministic citation-validation gate until every claim maps to a retrieved source',
          correct: true,
          note: 'Deterministic validation doesn\'t care how confident the model sounds — either the sources are there or the answer doesn\'t ship.'
        },
        {
          text: 'Re-prompt the model to "only use the context" and send whatever comes back',
          correct: false,
          note: 'Prompting raises the odds; it guarantees nothing. Guarantees live in code, not in instructions.'
        }
      ],
      realWorld: 'Every generation in the clinical RAG pipeline passes deterministic citation validation — which is how the system holds 100% grounded responses and 130/130 traceable citations: the check is code, not a prompt.'
    },
    {
      context: 'Clinical RAG hybrid retrieval — dense vectors + BM25 fused via RRF, then cross-encoder reranking.',
      situation: 'A query uses precise clinical shorthand that the embedding model maps to the wrong neighborhood. Dense-only retrieval returns confident, irrelevant passages. What do you change?',
      options: [
        {
          text: 'Increase top-k and hope the right chunk appears somewhere in the list',
          correct: false,
          note: 'More irrelevant results dilute the reranker and burn context window — volume is not relevance.'
        },
        {
          text: 'Fuse dense retrieval with BM25 lexical search via Reciprocal Rank Fusion, then rerank with a cross-encoder',
          correct: true,
          note: 'Lexical search catches the exact term matches embeddings miss, RRF combines both rankings, and the cross-encoder judges the final order.'
        },
        {
          text: 'Switch entirely to keyword search',
          correct: false,
          note: 'You would trade one blind spot for another — paraphrased queries with no exact term overlap now fail instead.'
        }
      ],
      realWorld: 'That is the pipeline we shipped: hybrid dense + BM25 retrieval via RRF with cross-encoder reranking — 85% Precision@1, 87.9% MRR, and 100% candidate recall on the evaluation set.'
    },
    {
      context: 'Evaluation harness — retrieval metrics (P@1, MRR, Recall) plus generation metrics (Groundedness, Answer Correctness).',
      situation: 'You tune the reranker and the answers "feel" sharper after three spot checks. How do you know the change is actually an improvement?',
      options: [
        {
          text: 'Ship it — three good manual checks are enough confidence',
          correct: false,
          note: 'Three anecdotes measure your memory of the last run, not the system. Regressions hide in the queries you did not re-check.'
        },
        {
          text: 'Run the evaluation harness against the fixed test set: retrieval metrics plus Groundedness and Answer Correctness',
          correct: true,
          note: 'Same set, same numbers, every change — now "better" is a measurement instead of a feeling.'
        },
        {
          text: 'Ask an LLM to grade its own answers and ship on the average',
          correct: false,
          note: 'LLM-as-a-judge belongs in the harness, but alone it is uncalibrated — it needs deterministic retrieval metrics and groundedness checks alongside it.'
        }
      ],
      realWorld: 'The clinical RAG project runs exactly this harness: P@1, MRR, candidate recall, groundedness, and answer correctness. The 85% P@1 and 75% Answer Correctness figures come from it, and every pipeline change is measured against the same set.'
    },
    {
      context: 'Abu Prompt (PersonalBrandingAgent) — autonomous branding agent · Chroma RAG + SQLite state + pre-publish guardrails.',
      situation: 'Two cron-triggered branding runs overlap and both prepare the same content hash. What guarantee prevents both from publishing?',
      options: [
        {
          text: 'Trust the model — ask it to confirm the post is different and publish on its word',
          correct: false,
          note: 'A model\'s judgment is not a deduplication strategy; "feels different" is exactly how near-duplicates ship.'
        },
        {
          text: 'Acquire the per-workflow SQLite lock, persist intent before the request, enforce one non-failed intent per content hash and one publication per intent, then run the active exact-hash and 14-day overuse checks',
          correct: true,
          note: 'The active checks and database constraints still hold when scheduling overlaps; publishing safety does not depend on the model noticing a duplicate.'
        },
        {
          text: 'Skip the check — LinkedIn rewards volume, and a near-repost is harmless',
          correct: false,
          note: 'Overuse erodes credibility, and the coverage ledger exists specifically to stop leaning on the same project or evidence inside 14 days.'
        }
      ],
      realWorld: 'DuplicateDetector\'s default workflow actively checks exact hashes and 14-day overuse; SQLite enforces one non-failed intent per content hash and one publication per intent; and each cron-triggered branding run holds a per-workflow lock. A cosine near-duplicate detector (threshold >= 0.90 over up to 50 records from the same 14-day window) exists in the codebase but is not active until an embedder is wired, so it is treated as a capability, not a shipped guarantee.'
    },
    {
      context: 'Abu Prompt verification — deterministic pre-publish gates decide what ships; the LLM judge only advises.',
      situation: 'A draft claims a metric that appears in the portfolio\'s positioning docs but has no verified evidence item behind it. The rewriter offers to rephrase it until it "sounds supported." What does the gate do?',
      options: [
        {
          text: 'Revise — let the model rephrase until the claim maps to something in the context',
          correct: false,
          note: 'Rephrasing a provenance failure manufactures plausible support; a source the context does not hold cannot be cited into existence.'
        },
        {
          text: 'Reject the claim — guidance vocabulary with no evidence behind it is a provenance failure, and no rewording can fix provenance',
          correct: true,
          note: 'Severity is decided by one question: can rewriting against this same evidence make it publishable? Wording findings revise; evidence findings reject.'
        },
        {
          text: 'Publish with a disclaimer — readers can judge the claim for themselves',
          correct: false,
          note: 'A disclaimer does not make an ungrounded claim grounded; the gate exists so nobody has to audit the agent\'s confidence by hand.'
        }
      ],
      realWorld: 'The verifier runs deterministic checks — citation exists, evidence available, evidence state strong enough, references validated — with GUIDANCE_AS_EVIDENCE and the forbidden-inference rules transcribed from the corpus policy. Advisory judge findings can force revision, but they cannot turn a deterministic failure into a pass or issue terminal rejection: ungrounded posts still fail closed.'
    }
  ];

  var SCORE_MESSAGES = [
    { min: 7, text: 'Perfect read. You think in guarantees — that is the bar the shipped systems are held to.' },
    { min: 5, text: 'Strong instincts. These trade-offs are subtle by design; production is where they get paid.' },
    { min: 3, text: 'Half the battle. The explanations above are exactly the reasoning behind the real implementations.' },
    { min: 0, text: 'These scenarios took real iteration to get right — the Builder\'s Log below has the full story.' }
  ];

  /* ================= SIMULATOR ================= */

  var simRoot = document.getElementById('simulator');
  var mindRoot = document.getElementById('mind');
  var jumpButtons = document.querySelectorAll('.sim-pill');
  var revealBtn = document.querySelector('.mind-reveal');

  function freshAnswers() {
    var answers = [];
    for (var i = 0; i < SCENARIOS.length; i++) answers.push(-1);
    return answers;
  }

  // phase: 'intro' | 'scenario' | 'summary' | 'reveal'
  // answers[i]: -1 = unanswered, otherwise the chosen option index
  var simState = { phase: 'intro', index: 0, answers: freshAnswers(), started: false, revealReturn: null };

  function optionKey(i) {
    return String.fromCharCode(65 + i);
  }

  function hasProgress() {
    if (!simState.started) return false;
    if (simState.index > 0) return true;
    for (var i = 0; i < simState.answers.length; i++) {
      if (simState.answers[i] >= 0) return true;
    }
    return false;
  }

  function dotsHtml() {
    var html = '';
    for (var i = 0; i < SCENARIOS.length; i++) {
      var cls = 'sim-dot';
      if (i === simState.index && simState.phase === 'scenario') cls += ' current';
      else if (simState.answers[i] >= 0) cls += ' done';
      html += '<span class="' + cls + '"></span>';
    }
    return html;
  }

  function introHtml() {
    var html = '' +
      '<div class="sim-intro-screen">' +
      '<div class="sim-intro-title">How do you decide under pressure?</div>' +
      '<p class="sim-intro-text">' + SCENARIOS.length + ' scenarios drawn from real projects — Quizey\'s ' +
      'concurrency and security guarantees, the clinical RAG pipeline\'s grounding, retrieval, and evaluation ' +
      'design, and Abu Prompt\'s autonomous publish guardrails (Chroma RAG + SQLite state + deterministic ' +
      'pre-publish validation). Pick a path; you get the engineering reasoning either way. Move freely: jump ' +
      'between scenarios with the pills above, skip ahead, go back, or hit "Reveal Architecture &amp; ' +
      'Trade-offs" to inspect every solution in one click — your answers stay where you left them.</p>' +
      '<div class="sim-actions">';
    if (hasProgress()) {
      html += '<button type="button" class="btn-primary" data-action="resume">Resume the simulator</button>' +
        '<button type="button" class="btn-outline" data-action="start">Start over</button>';
    } else {
      html += '<button type="button" class="btn-primary" data-action="start">Start the simulator</button>';
    }
    html += '</div></div>';
    return html;
  }

  function scenarioHtml() {
    var s = SCENARIOS[simState.index];
    var selected = simState.answers[simState.index];
    var answered = selected >= 0;
    var last = simState.index === SCENARIOS.length - 1;
    var html = '' +
      '<div class="sim-top">' +
      '<div class="sim-progress-label">Scenario ' + (simState.index + 1) + ' of ' + SCENARIOS.length + '</div>' +
      '<div class="sim-dots" aria-hidden="true">' + dotsHtml() + '</div>' +
      '</div>' +
      '<div class="sim-context">' + s.context + '</div>' +
      '<h3 class="sim-situation" tabindex="-1">' + s.situation + '</h3>' +
      '<div class="sim-options" role="group" aria-label="Decision options">';

    for (var i = 0; i < s.options.length; i++) {
      var o = s.options[i];
      var cls = 'sim-option';
      if (answered) {
        if (o.correct) cls += ' correct';
        else if (i === selected) cls += ' chosen-wrong';
        else cls += ' dimmed';
      }
      html += '<button type="button" class="' + cls + '" data-action="choose" data-index="' + i + '"' +
        (answered && i === selected ? ' aria-pressed="true"' : '') + '>' +
        '<span class="sim-option-key" aria-hidden="true">' + optionKey(i) + '</span>' +
        '<span>' + o.text + '</span>' +
        '</button>';
    }

    html += '</div>';

    if (answered) {
      var chosen = s.options[selected];
      var ok = !!chosen.correct;
      html += '<div class="sim-feedback" tabindex="-1">' +
        '<div class="sim-feedback-verdict ' + (ok ? 'ok">✓ Sound decision' : 'no">✗ Not the call I\'d ship') +
        '</div>' +
        '<p class="sim-feedback-note">' + chosen.note + '</p>' +
        '<p class="sim-feedback-real"><span class="sim-feedback-real-label">In the real system</span>' +
        s.realWorld + '</p>' +
        '</div>';
    }

    html += '<div class="sim-nav">' +
      '<button type="button" class="btn-outline sim-nav-btn" data-action="prev"' +
      (simState.index === 0 ? ' disabled' : '') + '>← Previous</button>' +
      '<button type="button" class="sim-nav-exit" data-action="exit">Exit</button>' +
      '<button type="button" class="btn-primary sim-nav-btn" data-action="next">' +
      (last ? 'See your results' : 'Next →') + '</button>' +
      '</div>';

    return html;
  }

  function tally() {
    var correct = 0;
    var answered = 0;
    for (var i = 0; i < SCENARIOS.length; i++) {
      var a = simState.answers[i];
      if (a >= 0) {
        answered++;
        if (SCENARIOS[i].options[a].correct) correct++;
      }
    }
    return {
      correct: correct,
      incorrect: answered - correct,
      unanswered: SCENARIOS.length - answered
    };
  }

  function summaryHtml() {
    var counts = tally();
    var msg = '';
    for (var i = 0; i < SCORE_MESSAGES.length; i++) {
      if (counts.correct >= SCORE_MESSAGES[i].min) {
        msg = SCORE_MESSAGES[i].text;
        break;
      }
    }
    var html = '' +
      '<div class="sim-summary">' +
      '<div class="sim-summary-score">' + counts.correct + ' / ' + SCENARIOS.length + '</div>' +
      '<div class="sim-summary-title" tabindex="-1">Sound decisions</div>' +
      '<div class="sim-summary-metrics">' +
      '<span class="sim-metric ok">' + counts.correct + ' correct</span>' +
      '<span class="sim-metric no">' + counts.incorrect + ' incorrect</span>' +
      (counts.unanswered > 0 ?
        '<span class="sim-metric skip">' + counts.unanswered + ' unanswered</span>' : '') +
      '</div>' +
      '<p class="sim-summary-text">' + msg + '</p>';

    if (counts.unanswered > 0) {
      html += '<p class="sim-summary-note">' + counts.unanswered +
        (counts.unanswered === 1 ? ' scenario was' : ' scenarios were') +
        ' left unanswered — skipped work is listed above, never scored as right or wrong. ' +
        'Review answers drops you on the first one.</p>';
    }

    html += '<div class="sim-actions">' +
      '<button type="button" class="btn-primary" data-action="restart">Run it again</button>' +
      '<button type="button" class="btn-outline" data-action="review">Review answers</button>' +
      '</div></div>';
    return html;
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function revealHtml() {
    var html = '' +
      '<div class="sim-reveal">' +
      '<div class="sim-reveal-head">' +
      '<div class="sim-reveal-title" tabindex="-1">Architecture &amp; Trade-offs — all ' + SCENARIOS.length +
      ' scenarios</div>' +
      '<p class="sim-reveal-sub">The shipped decision and the reasoning behind every rejection — the full ' +
      'engineering solution, no playthrough required.</p>' +
      '</div>';

    for (var i = 0; i < SCENARIOS.length; i++) {
      var s = SCENARIOS[i];
      var correct = s.options[0];
      for (var j = 0; j < s.options.length; j++) {
        if (s.options[j].correct) correct = s.options[j];
      }
      html += '<article class="sim-reveal-card">' +
        '<div class="sim-reveal-num">Scenario ' + pad2(i + 1) + ' · ' + s.context + '</div>' +
        '<p class="sim-reveal-q">' + s.situation + '</p>' +
        '<div class="sim-reveal-solution"><span class="sim-reveal-label">Shipped decision</span>' +
        correct.text + '</div>' +
        '<div class="sim-reveal-real"><span class="sim-feedback-real-label">In the real system</span>' +
        s.realWorld + '</div>' +
        '<div class="sim-reveal-trades"><span class="sim-reveal-label">Trade-offs rejected</span><ul>';
      for (var k = 0; k < s.options.length; k++) {
        if (!s.options[k].correct) html += '<li>' + s.options[k].note + '</li>';
      }
      html += '</ul></div>' +
        '<button type="button" class="btn-outline sim-reveal-open" data-action="reveal-jump" data-index="' +
        i + '">Open scenario ' + pad2(i + 1) + '</button>' +
        '</article>';
    }

    html += '<div class="sim-actions sim-reveal-actions">' +
      '<button type="button" class="btn-primary" data-action="reveal-back">Back to the simulator</button>' +
      '</div></div>';
    return html;
  }

  function focusSim(selector) {
    var node = simRoot.querySelector(selector);
    if (node) node.focus();
  }

  function syncMindControls() {
    if (jumpButtons.length) {
      for (var i = 0; i < jumpButtons.length; i++) {
        var active = simState.phase === 'scenario' && i === simState.index;
        jumpButtons[i].classList.toggle('active', active);
        jumpButtons[i].classList.toggle('answered', simState.answers[i] >= 0);
      }
    }
    if (revealBtn) {
      revealBtn.setAttribute('aria-pressed', simState.phase === 'reveal' ? 'true' : 'false');
    }
  }

  function renderSim() {
    if (!simRoot) return;
    if (simState.phase === 'intro') simRoot.innerHTML = introHtml();
    else if (simState.phase === 'scenario') simRoot.innerHTML = scenarioHtml();
    else if (simState.phase === 'reveal') simRoot.innerHTML = revealHtml();
    else simRoot.innerHTML = summaryHtml();
    syncMindControls();
  }

  function firstUnanswered() {
    for (var i = 0; i < simState.answers.length; i++) {
      if (simState.answers[i] < 0) return i;
    }
    return 0;
  }

  function startRun() {
    simState = { phase: 'scenario', index: 0, answers: freshAnswers(), started: true, revealReturn: null };
    renderSim();
    focusSim('.sim-situation');
  }

  function jumpTo(i) {
    simState.phase = 'scenario';
    simState.started = true;
    simState.revealReturn = null;
    simState.index = Math.max(0, Math.min(SCENARIOS.length - 1, i));
    renderSim();
    focusSim('.sim-situation');
  }

  function backFromReveal() {
    var ret = simState.revealReturn || { phase: 'intro', index: 0 };
    simState.phase = ret.phase;
    simState.index = ret.index;
    simState.revealReturn = null;
    renderSim();
    if (ret.phase === 'scenario') focusSim('.sim-situation');
    else if (ret.phase === 'summary') focusSim('.sim-summary-title');
    else focusSim(hasProgress() ? '[data-action="resume"]' : '[data-action="start"]');
  }

  function handleSimAction(action, index) {
    if (action === 'start') {
      startRun();
    } else if (action === 'resume') {
      simState.phase = 'scenario';
      renderSim();
      focusSim('.sim-situation');
    } else if (action === 'choose') {
      simState.answers[simState.index] = index;
      renderSim();
      focusSim('.sim-feedback');
    } else if (action === 'jump') {
      jumpTo(index);
    } else if (action === 'reveal') {
      if (simState.phase === 'reveal') {
        backFromReveal();
      } else {
        simState.revealReturn = { phase: simState.phase, index: simState.index };
        simState.phase = 'reveal';
        renderSim();
        focusSim('.sim-reveal-title');
      }
    } else if (action === 'reveal-back') {
      backFromReveal();
    } else if (action === 'reveal-jump') {
      jumpTo(index);
    } else if (action === 'prev') {
      if (simState.index > 0) simState.index--;
      renderSim();
      focusSim('.sim-situation');
    } else if (action === 'next') {
      if (simState.index === SCENARIOS.length - 1) {
        simState.phase = 'summary';
        renderSim();
        focusSim('.sim-summary-title');
      } else {
        simState.index++;
        renderSim();
        focusSim('.sim-situation');
      }
    } else if (action === 'exit') {
      simState.phase = 'intro';
      simState.revealReturn = null;
      renderSim();
      focusSim(hasProgress() ? '[data-action="resume"]' : '[data-action="start"]');
    } else if (action === 'review') {
      simState.phase = 'scenario';
      simState.index = firstUnanswered();
      renderSim();
      focusSim('.sim-situation');
    } else if (action === 'restart') {
      startRun();
    }
  }

  if (simRoot) {
    renderSim();
    var clickHost = mindRoot || simRoot;
    clickHost.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn || !clickHost.contains(btn)) return;
      handleSimAction(btn.getAttribute('data-action'), parseInt(btn.getAttribute('data-index'), 10));
    });
  }

  /* ================= BUILDER'S LOG FILTER ================= */

  var filterButtons = document.querySelectorAll('.log-filter');
  var logEntries = document.querySelectorAll('.log-entry');
  var logCount = document.getElementById('log-count');

  function applyLogFilter(filter) {
    var shown = 0;
    for (var i = 0; i < logEntries.length; i++) {
      var entry = logEntries[i];
      var cats = (entry.getAttribute('data-category') || '').split(/\s+/);
      var match = filter === 'all' || cats.indexOf(filter) !== -1;
      entry.hidden = !match;
      if (match) shown++;
    }
    for (var j = 0; j < filterButtons.length; j++) {
      var b = filterButtons[j];
      var active = b.getAttribute('data-filter') === filter;
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (active) b.classList.add('active');
      else b.classList.remove('active');
    }
    if (logCount) {
      logCount.textContent = 'Showing ' + shown + ' of ' + logEntries.length + ' entries';
    }
  }

  for (var f = 0; f < filterButtons.length; f++) {
    filterButtons[f].addEventListener('click', function () {
      applyLogFilter(this.getAttribute('data-filter'));
    });
  }

  /* ================= CHAPTER SCROLLSPY ================= */

  var chapterLinks = document.querySelectorAll('.sig-nav-link');

  function setActiveChapter(id) {
    for (var i = 0; i < chapterLinks.length; i++) {
      if (chapterLinks[i].getAttribute('data-chapter') === id) {
        chapterLinks[i].setAttribute('aria-current', 'true');
      } else {
        chapterLinks[i].removeAttribute('aria-current');
      }
    }
  }

  if (typeof IntersectionObserver === 'function' && chapterLinks.length) {
    var chapters = document.querySelectorAll('.sig-chapter');
    var observer = new IntersectionObserver(function (observed) {
      for (var i = 0; i < observed.length; i++) {
        if (observed[i].isIntersecting) setActiveChapter(observed[i].target.id);
      }
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    for (var c = 0; c < chapters.length; c++) observer.observe(chapters[c]);
  }
})();
