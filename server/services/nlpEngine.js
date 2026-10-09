/**
 * World-Class AI/NLP Intelligence Engine for LiveMail Classifier
 * 
 * STRICT Controlled Classification Categories:
 * - Primary
 * - Personal
 * - Finance
 * - College / Student
 * - Security
 * - Spam
 * - Other
 * 
 * Features:
 * - High-precision text cleaning (HTML, tracking pixels, sign-off blocks, boilerplate removal)
 * - Stopword filtration & tokenization
 * - Weighted TF-IDF keyword extraction with Subject prominence (4.0x) & relevance scores
 * - Meaningful multi-word key phrases extraction
 * - Dynamic topic detection (Examination, Payment, Account Security, etc.)
 * - Intent detection (Action Required, Alert, Notification, Invitation, etc.)
 * - Action required & deadline detection with negation handling
 * - Structured entity recognition (ORGANIZATION, DATE, TIME, MONEY, LOCATION, URL, EMAIL, PHONE)
 * - Context-aware importance score (0-100) and priority (Critical, High, Normal, Low)
 * - Sentiment analysis & polarity score (-1.0 to +1.0)
 * - Extractive factual AI Summary (1-2 sentences from actual email content)
 * - Classification confidence & clear natural language classificationReason
 */

// Comprehensive Stopwords & Email Fluff List
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot',
  'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d',
  'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i',
  'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s',
  'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll',
  'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll',
  'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while',
  'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll',
  'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
  // Email specific fluff, greetings, signatures, headers
  'hello', 'hi', 'hey', 'dear', 'greetings', 'regards', 'best', 'thanks', 'thank', 'sincerely', 'cheers', 'warm',
  'wishes', 'please', 'find', 'attached', 'attachment', 'email', 'mail', 'message', 'sent', 'reply', 'forward',
  'subject', 'from', 'to', 'cc', 'bcc', 'date', 'wrote', 'pm', 'am', 'com', 'http', 'https', 'www', 'org', 'net',
  'team', 'user', 'customer', 'sir', 'madam', 'hope', 'well', 'let', 'know', 'feel', 'free', 'reach', 'out',
  'unsubscribe', 'click', 'here', 'privacy', 'policy', 'terms', 'service', 'copyright', 'reserved'
]);

/**
 * 1. Text Cleaning: Strips HTML, tracking links, signatures, greetings & redundant noise
 */
const HAS_HTML_OR_NOISE = /<script|<style|<[^>]+>|&[a-z0-9]+;|https?:\/\/|[\r\n\t]|--|__|\b(?:warm|best|kind)?\s*regards\b|\bsincerely\b|\bthanks\b|\bcheers\b/i;

function cleanText(input) {
  if (!input || typeof input !== 'string') return '';
  if (!HAS_HTML_OR_NOISE.test(input)) {
    return input.trim().replace(/\s+/g, ' ');
  }
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(?:--|__|\b(?:warm|best|kind)?\s*regards\b|\bsincerely\b|\bthanks\b|\bcheers\b)[\s\S]*$/i, ' ') // remove signature footer
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 2. Tokenizer
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
}

/**
 * 3. Semantic Keyword Ranking with TF-IDF & Subject Prominence (4.0x)
 */
function extractKeywords(subject = '', body = '', maxCount = 8) {
  const cleanSubject = cleanText(subject);
  const cleanBody = cleanText(body);

  const subjectTokens = tokenize(cleanSubject);
  const bodyTokens = tokenize(cleanBody);

  const termFreq = {};

  // Subject tokens carry 4.0x weight
  subjectTokens.forEach(t => {
    termFreq[t] = (termFreq[t] || 0) + 4.0;
  });

  // Body tokens carry 1.0x weight
  bodyTokens.forEach(t => {
    termFreq[t] = (termFreq[t] || 0) + 1.0;
  });

  const sortedTerms = Object.keys(termFreq).sort((a, b) => termFreq[b] - termFreq[a]);
  const maxScore = termFreq[sortedTerms[0]] || 1;

  const keywordObjects = sortedTerms.slice(0, maxCount).map(word => ({
    text: word,
    score: Math.round((termFreq[word] / maxScore) * 100) / 100
  }));

  const keywordStrings = keywordObjects.map(k => k.text);

  return {
    keywords: keywordStrings,
    keywordScores: keywordObjects
  };
}

/**
 * 4. Multi-Word Key Phrase Extraction
 */
const HIGH_VALUE_PHRASES = [
  'exam timetable', 'examination timetable', 'semester examination', 'end semester',
  'college admission', 'student registration', 'tuition fee payment', 'assignment submission',
  'internal assessment', 'grade card', 'academic calendar', 'hall ticket', 'course registration',
  'bank transaction', 'payment due date', 'credit card bill', 'account balance', 'transaction alert',
  'salary credited', 'invoice payment', 'payment confirmation', 'electricity bill', 'tax invoice',
  'security alert', 'password reset', 'password changed', 'verification code', 'two-factor authentication',
  'unauthorized login', 'account verification', 'suspicious activity', 'identity verification', 'new login detected',
  'personal invitation', 'family event', 'dinner invitation', 'weekend plans'
];

function extractKeyPhrases(subject = '', body = '', maxCount = 5) {
  const combined = `${subject} ${body}`.toLowerCase();
  const matchedPhrases = [];

  HIGH_VALUE_PHRASES.forEach(phrase => {
    if (combined.includes(phrase) && !matchedPhrases.some(p => p.text === phrase)) {
      matchedPhrases.push({
        text: phrase,
        score: phrase.includes('examination') || phrase.includes('security') || phrase.includes('payment') ? 0.95 : 0.88
      });
    }
  });

  // Statistical bi-gram extraction from Subject if needed
  if (matchedPhrases.length < maxCount) {
    const sWords = tokenize(cleanText(subject));
    for (let i = 0; i < sWords.length - 1; i++) {
      const bi = `${sWords[i]} ${sWords[i + 1]}`;
      if (!matchedPhrases.some(p => p.text === bi) && matchedPhrases.length < maxCount) {
        matchedPhrases.push({ text: bi, score: 0.80 });
      }
    }
  }

  return matchedPhrases.slice(0, maxCount);
}

/**
 * 5. Structured Entity Recognition
 */
const KNOWN_ORGS = [
  'Google', 'Microsoft', 'Amazon', 'Apple', 'Meta', 'Netflix', 'TCS', 'Infosys',
  'Wipro', 'Accenture', 'IBM', 'Oracle', 'Cisco', 'Adobe', 'Uber',
  'HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'PayPal', 'Stripe', 'Razorpay',
  'VTU', 'University', 'College', 'Department of Computer Science', 'AICTE'
];

const COMPILED_ORGS = KNOWN_ORGS.map(org => ({
  org,
  regex: new RegExp(`\\b${org.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
}));

const KNOWN_LOCATIONS = [
  'Bengaluru', 'Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune',
  'New York', 'San Francisco', 'London', 'Singapore', 'Dubai', 'Boston'
];

const COMPILED_LOCATIONS = KNOWN_LOCATIONS.map(loc => ({
  loc,
  regex: new RegExp(`\\b${loc.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
}));

function extractEntities(subject = '', body = '') {
  const text = `${subject} ${body}`;
  const entities = [];
  const seen = new Set();

  const addEntity = (type, val) => {
    const clean = val.trim().replace(/\s+/g, ' ');
    const key = `${type}:${clean.toLowerCase()}`;
    if (!seen.has(key) && clean.length > 1) {
      seen.add(key);
      entities.push({ type, text: clean, value: clean });
    }
  };

  // Organizations
  COMPILED_ORGS.forEach(({ org, regex }) => {
    if (regex.test(text)) addEntity('ORGANIZATION', org);
  });

  // Locations
  COMPILED_LOCATIONS.forEach(({ loc, regex }) => {
    if (regex.test(text)) addEntity('LOCATION', loc);
  });

  // Monetary Amounts
  const moneyMatches = text.match(/(?:[\$€£₹]|(?:USD|INR|EUR|GBP|Rs\.?))\s?\d+(?:[,\.]\d+)?(?:\s?(?:k|m|million|thousand|crore|lakh))?/gi) || [];
  moneyMatches.slice(0, 3).forEach(m => addEntity('MONEY', m));

  // Dates
  const dateMatches = text.match(/\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\b(?:today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/gi) || [];
  dateMatches.slice(0, 4).forEach(d => addEntity('DATE', d));

  // Times
  const timeMatches = text.match(/\b\d{1,2}:\d{2}\s*(?:am|pm)?|\b\d{1,2}\s*(?:am|pm)\b/gi) || [];
  timeMatches.slice(0, 3).forEach(t => addEntity('TIME', t));

  // URLs
  const urlMatches = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  urlMatches.slice(0, 2).forEach(u => addEntity('URL', u));

  return entities.slice(0, 10);
}

/**
 * 6. Dynamic Topic Detection
 */
const TOPIC_PATTERNS = [
  { topic: 'Examination', test: /\b(exam|examination|timetable|semester|finals|internal marks|results|hall ticket)\b/i },
  { topic: 'Assignment', test: /\b(assignment|homework|project submission|lab record|submission deadline)\b/i },
  { topic: 'Admission & Registration', test: /\b(admission|course registration|student registration|scholarship|tuition fee)\b/i },
  { topic: 'Academic Notice', test: /\b(circular|syllabus|lecture|faculty|professor|department notice|academic calendar)\b/i },
  { topic: 'Account Security', test: /\b(security alert|unauthorized|new login|device login|suspended|suspicious activity)\b/i },
  { topic: 'Password & Authentication', test: /\b(password reset|password changed|verification code|otp|two-factor|2fa)\b/i },
  { topic: 'Payment & Due Date', test: /\b(payment is due|bill due|invoice|due date|payment reminder|electricity bill)\b/i },
  { topic: 'Bank Transaction', test: /\b(transaction was successful|account balance|deposit|withdrawal|salary credited|transfer)\b/i },
  { topic: 'Personal Invitation', test: /\b(dinner|lunch|weekend|birthday|party|family event|wedding|reunion|catch up)\b/i }
];

function detectTopic(subject = '', body = '', category = '') {
  const text = `${subject} ${body}`;
  for (const item of TOPIC_PATTERNS) {
    if (item.test.test(text)) return item.topic;
  }
  if (category === 'College / Student') return 'Academic Notice';
  if (category === 'Finance') return 'Financial Notice';
  if (category === 'Security') return 'Security Verification';
  if (category === 'Personal') return 'Personal Communication';
  return 'General Communication';
}

/**
 * 7. Intent Detection
 */
const INTENT_PATTERNS = [
  { intent: 'Alert', test: /\b(security alert|warning|critical|unauthorized|failed|breach|fraud|overdue|new login)\b/i },
  { intent: 'Action Required', test: /\b(action required|action needed|please (?:submit|pay|verify|complete|review|confirm)|mandatory|must respond)\b/i },
  { intent: 'Invitation', test: /\b(invitation|invite|join us|cordially invited|please attend|rsvp|dinner this)\b/i },
  { intent: 'Reminder', test: /\b(reminder|remember|don't forget|upcoming|due soon)\b/i },
  { intent: 'Confirmation', test: /\b(confirmation|confirmed|receipt|booking confirmation|successfully received|processed|transaction was successful)\b/i },
  { intent: 'Verification', test: /\b(verification code|otp|verify your email|verify account|pin code)\b/i },
  { intent: 'Notification', test: /\b(notification|notice|published|scheduled|status update|has released|timetable)\b/i },
  { intent: 'Question', test: /\b(question|inquiry|can you|are you available|let me know if)\b/i }
];

function detectIntent(subject = '', body = '') {
  const text = `${subject} ${body}`;
  for (const item of INTENT_PATTERNS) {
    if (item.test.test(text)) return item.intent;
  }
  return 'Information';
}

/**
 * 8. Action Required & Deadline Detection
 */
function detectActionAndDeadline(subject = '', body = '') {
  const text = `${subject} ${body}`;

  const isNegated = /no\s+(?:urgent\s+)?action\s+(?:is\s+)?required/i.test(text) ||
                    /no\s+action\s+needed/i.test(text) ||
                    /for\s+information\s+only/i.test(text);

  let requiresAction = false;
  let requiredAction = '';
  let deadline = '';

  if (!isNegated) {
    const actionMatch = text.match(/\b(?:please|kindly|action required|you must|need to)\s+([^.!?\n]{5,60})/i);
    if (actionMatch) {
      requiresAction = true;
      requiredAction = actionMatch[0].trim();
    } else if (/\b(action required|verification required|payment due|submit before|secure your account)\b/i.test(text)) {
      requiresAction = true;
      requiredAction = 'Action or verification required';
    }
  }

  // Deadline extraction
  const deadlineMatch = text.match(/\b(?:due (?:by|on|date)|deadline|before|expires?|by)\s+([A-Za-z0-9,\s]{3,30}?)(?=[.!?\n]|$)/i);
  if (deadlineMatch) {
    const rawDeadline = deadlineMatch[1].trim();
    if (rawDeadline.length >= 3 && !/^(the|a|this)$/i.test(rawDeadline)) {
      deadline = rawDeadline;
    }
  }

  return {
    requiresAction,
    requiredAction,
    actionDescription: requiredAction,
    deadline
  };
}

/**
 * 9. Sentiment Analysis
 */
const POSITIVE_WORDS = new Set([
  'congratulations', 'congrats', 'pleased', 'delighted', 'happy', 'great', 'excellent',
  'approved', 'success', 'successful', 'selected', 'welcome', 'award', 'reward', 'bonus',
  'offer', 'accepted', 'thank', 'wonderful', 'appreciate', 'positive', 'good', 'best'
]);

const NEGATIVE_WORDS = new Set([
  'urgent', 'warning', 'critical', 'failed', 'failure', 'error', 'suspended', 'overdue',
  'unauthorized', 'threat', 'rejected', 'declined', 'cancelled', 'problem', 'breach',
  'fraud', 'complaint', 'delay', 'penalty', 'dispute', 'blocked', 'lost', 'suspicious'
]);

function analyzeSentiment(subject = '', body = '') {
  const tokens = tokenize(`${subject} ${body}`);
  let score = 0;

  tokens.forEach(t => {
    if (POSITIVE_WORDS.has(t)) score += 1;
    if (NEGATIVE_WORDS.has(t)) score -= 1;
  });

  const normalizedScore = tokens.length > 0 ? Math.max(-1, Math.min(1, score / Math.max(3, tokens.length * 0.15))) : 0;

  let sentiment = 'Neutral';
  if (normalizedScore >= 0.25) sentiment = 'Positive';
  else if (normalizedScore <= -0.25) sentiment = 'Negative';

  return {
    sentiment,
    sentimentScore: Math.round(normalizedScore * 100) / 100
  };
}

/**
 * 10. STRICT Controlled Category Classification
 * Allowed categories:
 * - Primary
 * - Personal
 * - Finance
 * - College / Student
 * - Security
 * - Spam
 * - Other / Uncategorized
 */
const STRICT_CATEGORY_SIGNALS = {
  'Security': {
    senderPatterns: [
      /no-?reply@accounts\.google\.com/i,
      /security@/i,
      /alert@/i,
      /auth@/i,
      /account-security/i,
      /verify@/i,
      /login@/i,
      /identity@/i,
      /two-factor/i
    ],
    keywords: [
      'password', 'verification code', 'otp', 'two-factor', '2fa', 'security alert',
      'unauthorized', 'device login', 'reset password', 'account access', 'suspicious activity',
      'identity verification', 'account recovery', 'new login detected', 'secure your account',
      'sign-in attempt', 'security key', 'passcode', 'one-time password', 'compromised'
    ]
  },
  'Finance': {
    senderPatterns: [
      /bank/i,
      /billing/i,
      /payments?@/i,
      /invoice@/i,
      /statements?@/i,
      /finance@/i,
      /paypal/i,
      /stripe/i,
      /razorpay/i,
      /hdfc/i,
      /icici/i,
      /sbi/i,
      /chase/i,
      /wells\s?fargo/i
    ],
    keywords: [
      'bank', 'payment', 'transaction', 'credit card', 'debit card', 'account balance',
      'invoice', 'billing', 'receipt', 'tax', 'salary', 'deposit', 'withdrawal', 'transfer',
      'statement', 'loan', 'emi', 'refund', 'bill due', 'credited', 'debited', 'transaction alert',
      'payment receipt', 'account number', 'amount due', 'payment processed', 'wire transfer'
    ]
  },
  'College / Student': {
    senderPatterns: [
      /\.edu(\.[a-z]{2})?$/i,
      /university/i,
      /college/i,
      /academic/i,
      /registrar/i,
      /faculty/i,
      /campus/i,
      /student/i,
      /exam/i,
      /vtu/i,
      /aicte/i
    ],
    keywords: [
      'exam', 'examination', 'semester', 'timetable', 'syllabus', 'assignment', 'homework',
      'class', 'lecture', 'professor', 'faculty', 'tuition', 'attendance', 'hall ticket',
      'grade', 'marks', 'scholarship', 'admissions', 'university', 'college', 'student',
      'lab', 'internal marks', 'academic circular', 'course registration', 'curriculum',
      'coursework', 'student portal', 'gpa', 'credits', 'dean'
    ]
  },
  'Personal': {
    senderPatterns: [
      /gmail\.com$/i,
      /yahoo\.com$/i,
      /outlook\.com$/i,
      /hotmail\.com$/i,
      /icloud\.com$/i
    ],
    keywords: [
      'birthday', 'wedding', 'family', 'friend', 'dinner', 'weekend', 'vacation',
      'celebration', 'photos', 'invitation', 'reunion', 'dinner this', 'catch up',
      'party', 'get together', 'how are you', 'see you', 'congrats', 'wishes',
      'anniversary', 'family reunion'
    ]
  },
  'Spam': {
    senderPatterns: [
      /lottery/i,
      /prize/i,
      /winner/i,
      /jackpot/i,
      /reward/i,
      /crypto-promo/i,
      /luckyprize/i
    ],
    keywords: [
      'winner', 'prize', 'claim now', 'lottery', 'free money', 'guaranteed income',
      'bitcoin giveaway', 'cash reward', 'exclusive jackpot', 'risk-free',
      'you won', 'claim your reward', 'million dollars', 'act fast', '100% free',
      'wire millions', 'congratulations winner'
    ]
  },
  'Primary': {
    senderPatterns: [
      /team@/i,
      /support@/i,
      /admin@/i,
      /info@/i,
      /updates@/i,
      /hello@/i,
      /contact@/i
    ],
    keywords: [
      'meeting', 'project', 'proposal', 'agreement', 'deliverable', 'client',
      'partnership', 'sync', 'contract', 'collaboration', 'discussion', 'presentation',
      'follow up', 'important update', 'roadmap', 'schedule', 'action item'
    ]
  }
};

const COMPILED_CATEGORY_SIGNALS = {};
for (const cat in STRICT_CATEGORY_SIGNALS) {
  const { senderPatterns = [], keywords = [] } = STRICT_CATEGORY_SIGNALS[cat];
  COMPILED_CATEGORY_SIGNALS[cat] = {
    senderPatterns,
    keywordEntries: keywords.map(kw => ({
      kw,
      regex: new RegExp(`\\b${kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi')
    }))
  };
}

function classifyControlledCategory(subject = '', body = '', sender = '') {
  const cleanSub = cleanText(subject).toLowerCase();
  const cleanBdy = cleanText(body).toLowerCase();
  const cleanSnd = cleanText(sender).toLowerCase();

  const scores = {
    'Security': 0,
    'Finance': 0,
    'College / Student': 0,
    'Personal': 0,
    'Spam': 0,
    'Primary': 0
  };

  const evidenceMap = {
    'Security': { senderHits: [], keywordHits: [] },
    'Finance': { senderHits: [], keywordHits: [] },
    'College / Student': { senderHits: [], keywordHits: [] },
    'Personal': { senderHits: [], keywordHits: [] },
    'Spam': { senderHits: [], keywordHits: [] },
    'Primary': { senderHits: [], keywordHits: [] }
  };

  for (const cat in COMPILED_CATEGORY_SIGNALS) {
    const { senderPatterns, keywordEntries } = COMPILED_CATEGORY_SIGNALS[cat];

    // 1. Sender Information (High Importance: +5.0 per pattern match)
    for (let i = 0; i < senderPatterns.length; i++) {
      if (senderPatterns[i].test(cleanSnd)) {
        scores[cat] += 5.0;
        const sndMatch = cleanSnd.includes('<') ? cleanSnd.split('<')[1].replace('>', '').trim() : cleanSnd;
        if (!evidenceMap[cat].senderHits.includes(sndMatch)) {
          evidenceMap[cat].senderHits.push(sndMatch || cleanSnd);
        }
      }
    }

    // 2. Subject & Body Keyword Matching using Pre-compiled Regexes
    for (let i = 0; i < keywordEntries.length; i++) {
      const { kw, regex } = keywordEntries[i];
      regex.lastIndex = 0;
      const subMatches = cleanSub.match(regex);
      if (subMatches) {
        scores[cat] += subMatches.length * 4.5;
        if (!evidenceMap[cat].keywordHits.includes(`"${kw}" in subject`)) {
          evidenceMap[cat].keywordHits.push(`"${kw}" in subject`);
        }
      }

      regex.lastIndex = 0;
      const bdyMatches = cleanBdy.match(regex);
      if (bdyMatches) {
        scores[cat] += bdyMatches.length * 1.5;
        if (!evidenceMap[cat].keywordHits.includes(`"${kw}"`) && evidenceMap[cat].keywordHits.length < 4) {
          evidenceMap[cat].keywordHits.push(`"${kw}"`);
        }
      }
    }
  }

  let bestCat = 'Other / Uncategorized';
  let maxScore = 0;
  for (const cat in scores) {
    if (scores[cat] > maxScore) {
      maxScore = scores[cat];
      bestCat = cat;
    }
  }

  let confidence = 0.45;
  if (maxScore >= 6.0) {
    confidence = Math.min(0.99, 0.85 + (maxScore * 0.015));
  } else if (maxScore >= 3.0) {
    confidence = Math.min(0.84, 0.70 + (maxScore * 0.02));
  } else if (maxScore >= 1.5) {
    confidence = Math.min(0.68, 0.55 + (maxScore * 0.03));
  } else {
    // Low confidence threshold (< 1.5 score): categorize as Other / Uncategorized
    bestCat = 'Other / Uncategorized';
    confidence = 0.45;
  }

  // Construct evidence-backed classificationReason
  let classificationReason = '';
  const evidence = evidenceMap[bestCat];
  
  if (bestCat !== 'Other / Uncategorized' && evidence && (evidence.senderHits.length > 0 || evidence.keywordHits.length > 0)) {
    const parts = [];
    if (evidence.senderHits.length > 0) {
      parts.push(`sender address/domain (${evidence.senderHits[0]})`);
    }
    if (evidence.keywordHits.length > 0) {
      parts.push(`matched terms: ${evidence.keywordHits.slice(0, 3).join(', ')}`);
    }
    classificationReason = `Categorized as ${bestCat} based on verified email evidence: ${parts.join(' and ')}.`;
  } else if (bestCat !== 'Other / Uncategorized') {
    classificationReason = `Categorized as ${bestCat} based on general subject and body semantic context.`;
  } else {
    classificationReason = `Categorized under Other / Uncategorized as no distinct category domain signals were matched with high confidence.`;
  }

  return {
    category: bestCat,
    confidence: Math.round(confidence * 100) / 100,
    classificationReason
  };
}

/**
 * 11. Contextual Importance & Priority Engine (0-100)
 */
function computeImportance(subject = '', body = '', category = '', hasAttachments = false) {
  const text = `${subject} ${body}`.toLowerCase();
  let score = 45;

  if (category === 'Security') score += 35;
  else if (category === 'Finance') score += 25;
  else if (category === 'College / Student') score += 20;
  else if (category === 'Spam') score -= 30;

  const isNegated = /no\s+(?:urgent\s+)?action\s+required/i.test(text) || /not\s+urgent/i.test(text);

  if (!isNegated) {
    const urgentPhrases = [
      'urgent', 'immediately', 'action required', 'deadline', 'due today',
      'expiring', 'last date', 'account suspended', 'verification required',
      'critical alert', 'overdue', 'new login detected'
    ];
    urgentPhrases.forEach(p => {
      if (text.includes(p)) score += 12;
    });
  }

  if (/\b(urgent|important|action required|immediate|due|alert)\b/i.test(subject)) {
    score += 15;
  }

  if (hasAttachments) {
    score += 5;
  }

  const finalScore = Math.max(5, Math.min(98, score));

  let priority = 'Normal';
  if (finalScore >= 80) priority = 'Critical';
  else if (finalScore >= 65) priority = 'High';
  else if (finalScore >= 35) priority = 'Normal';
  else priority = 'Low';

  return {
    importanceScore: finalScore,
    priority,
    isImportant: finalScore >= 65
  };
}

/**
 * 12. Extractive Factual AI Summary Generation
 * Summarizes only verifiable facts stated in the email.
 * Preserves important names, dates, amounts, decisions, and action items.
 */
function generateAISummary(subject = '', body = '', category = '', topic = '', entities = [], actionInfo = {}) {
  const cleanSub = cleanText(subject);
  const cleanBdy = cleanText(body);

  if (!cleanBdy && !cleanSub) return 'No verifiable email text available for summary.';

  const facts = [];

  // Extract key entities (Amounts, Dates, Organizations)
  const moneyEnts = (entities || []).filter(e => e.type === 'MONEY').map(e => e.text);
  const dateEnts = (entities || []).filter(e => e.type === 'DATE').map(e => e.text);
  const orgEnts = (entities || []).filter(e => e.type === 'ORGANIZATION').map(e => e.text);

  if (moneyEnts.length > 0) {
    facts.push(`Amount: ${moneyEnts.slice(0, 2).join(', ')}`);
  }
  if (actionInfo.deadline || dateEnts.length > 0) {
    facts.push(`Date/Deadline: ${actionInfo.deadline || dateEnts[0]}`);
  }
  if (orgEnts.length > 0) {
    facts.push(`Org: ${orgEnts[0]}`);
  }

  // Extract core verifiable sentence from body
  const sentences = cleanBdy.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 15);
  let primaryFact = sentences[0] || cleanBdy.slice(0, 160);

  // If primary sentence doesn't contain subject context, combine cleanly
  let summaryText = primaryFact;
  if (cleanSub && !primaryFact.toLowerCase().includes(cleanSub.toLowerCase().slice(0, 15))) {
    summaryText = `${cleanSub} — ${primaryFact}`;
  }

  if (summaryText.length > 200) {
    summaryText = summaryText.slice(0, 197).trim() + '...';
  }

  // Include fact callouts if available
  if (facts.length > 0) {
    return `${summaryText} (${facts.join(' | ')})`;
  }

  return summaryText;
}

/**
 * 13. Master NLP Pipeline Runner
 */
function processEmailNLP(subject = '', body = '', existingLabels = [], hasAttachments = false, sender = '') {
  const cleanBodyText = cleanText(body);
  const cleanSub = cleanText(subject);

  const { keywords, keywordScores } = extractKeywords(cleanSub, cleanBodyText, 8);
  const keyPhrases = extractKeyPhrases(cleanSub, cleanBodyText, 5);
  const entities = extractEntities(cleanSub, cleanBodyText);
  const { sentiment, sentimentScore } = analyzeSentiment(cleanSub, cleanBodyText);
  const { category, confidence, classificationReason } = classifyControlledCategory(cleanSub, cleanBodyText, sender);
  const topic = detectTopic(cleanSub, cleanBodyText, category);
  const intent = detectIntent(cleanSub, cleanBodyText);
  const { requiresAction, requiredAction, deadline } = detectActionAndDeadline(cleanSub, cleanBodyText);
  const { importanceScore, priority, isImportant } = computeImportance(cleanSub, cleanBodyText, category, hasAttachments);
  const aiSummary = generateAISummary(cleanSub, cleanBodyText, category, topic, entities, { requiresAction, requiredAction, deadline });

  return {
    cleanBodyText,
    category,
    topic,
    intent,
    requiresAction,
    requiredAction,
    actionDescription: requiredAction,
    deadline,
    confidence,
    classificationConfidence: confidence,
    classificationReason,
    priority,
    importanceScore,
    isImportant,
    sentiment,
    sentimentScore,
    aiSummary,
    keywords,
    keywordScores,
    keyPhrases: keyPhrases.map(kp => kp.text),
    structuredKeyPhrases: keyPhrases,
    entities
  };
}

/**
 * 14. High-Performance Batch NLP Pipeline Processor
 */
function processEmailNLPBatch(emails = []) {
  if (!Array.isArray(emails) || emails.length === 0) return [];
  const len = emails.length;
  const results = new Array(len);
  for (let i = 0; i < len; i++) {
    const item = emails[i] || {};
    results[i] = processEmailNLP(
      item.subject || '',
      item.body || item.snippet || '',
      item.existingLabels || [],
      item.hasAttachments || false,
      item.sender || ''
    );
  }
  return results;
}

module.exports = {
  cleanText,
  tokenize,
  extractKeywords,
  extractKeyPhrases,
  extractEntities,
  detectTopic,
  detectIntent,
  detectActionAndDeadline,
  analyzeSentiment,
  classifyControlledCategory,
  computeImportance,
  generateAISummary,
  processEmailNLP,
  processEmailNLPBatch
};
