/**
 * Preview-only editorial fixtures for scripts/seed-content.ts (SEO-04).
 * Conservative, non-prescriptive physiotherapy education. Two condition pages
 * carry TEST reviewer fields so both review states render; news items are
 * fictional and prefixed "TEST:".
 */
import type { ConditionMeta, FaqItem, SourceRef } from "../src/db/schema/content";

export type Fixture = {
  kind: "blog" | "condition" | "news";
  slug: string;
  title: string;
  dek: string;
  specialty?: string; // specialties.code
  tags?: string[];
  body: string;
  faqs?: FaqItem[];
  sources?: SourceRef[];
  condition?: ConditionMeta;
  newsCategory?: string;
  reviewer?: { name: string; credential: string };
  authorName?: string;
  correction?: string;
};

const DISCLAIMER = "\n\n> This page is general information for patients in India. It does not diagnose or prescribe and does not replace an assessment by a qualified physiotherapist or doctor.";

const SRC_WHO: SourceRef = { title: "Musculoskeletal health fact sheet", url: "https://www.who.int/news-room/fact-sheets/detail/musculoskeletal-conditions", publisher: "World Health Organization" };
const SRC_NICE_LBP: SourceRef = { title: "Low back pain and sciatica in over 16s: assessment and management (NG59)", url: "https://www.nice.org.uk/guidance/ng59", publisher: "NICE" };
const SRC_NICE_OA: SourceRef = { title: "Osteoarthritis in over 16s: diagnosis and management (NG226)", url: "https://www.nice.org.uk/guidance/ng226", publisher: "NICE" };

const REVIEWER = { name: "TEST Reviewer", credential: "MPT (Orthopaedics)" };

export const FIXTURES: Fixture[] = [
  // ---------------------------------------------------------------- blog
  {
    kind: "blog", slug: "what-to-expect-at-your-first-physiotherapy-appointment", title: "What to expect at your first physiotherapy appointment",
    dek: "How a first assessment usually runs, what to bring, and the questions worth asking before you leave.", specialty: "general", tags: ["first visit", "patients"],
    authorName: "The Physio Index editorial team",
    body: `## Before you arrive\n\nBring any scan reports, prescriptions and a list of medicines. Wear clothing that lets the physiotherapist see and move the affected area.\n\n## The assessment\n\nMost first sessions start with a conversation about your symptoms, how they began and what makes them better or worse. The physiotherapist then examines movement, strength and function. Expect to be asked about your goals — returning to work, sport or daily tasks.\n\n## What you should leave with\n\n- A plain-language explanation of what the physiotherapist thinks is going on\n- A plan with a rough number of sessions and how progress will be measured\n- A small number of exercises you understand and can do at home\n\n## Questions worth asking\n\n1. What should I avoid, and what is safe to continue?\n2. How will we know it is working?\n3. When should I come back, and what would make you refer me elsewhere?${DISCLAIMER}`,
    faqs: [
      { question: "Do I need a doctor's referral to see a physiotherapist in India?", answer: "Usually no. Many clinics accept direct appointments, though your insurer may need a referral for reimbursement. Check with the clinic and your insurer." },
      { question: "How long is a first appointment?", answer: "Typically 30 to 60 minutes. Clinics publish their appointment durations on The Physio Index profile." },
    ],
    sources: [SRC_WHO],
  },
  {
    kind: "blog", slug: "how-to-read-a-physiotherapists-registration-and-qualifications", title: "How to read a physiotherapist's registration and qualifications",
    dek: "BPT, MPT, council registration, association membership — what each one means and what it does not.", specialty: "general", tags: ["verification", "qualifications"],
    authorName: "The Physio Index editorial team",
    body: `## Degrees\n\n**BPT** (Bachelor of Physiotherapy) is the entry qualification in India, usually four and a half years including an internship. **MPT** (Master of Physiotherapy) adds two years of specialisation, for example orthopaedics or neurology.\n\n## Registration\n\nSeveral states run allied and healthcare councils that register physiotherapists. Registration confirms identity and qualification; it is not an assessment of treatment quality. Where a council publishes a register, The Physio Index checks the number against it and labels the profile accordingly.\n\n## Memberships\n\nAssociation membership shows professional engagement but is not a licence. We label it separately so it is never mistaken for statutory registration.\n\n## What the labels on this site mean\n\nEach profile explains the check performed — registration checked, document reviewed or self-declared. Read the label, not just the badge.${DISCLAIMER}`,
    sources: [SRC_WHO],
  },
  {
    kind: "blog", slug: "returning-to-running-after-injury-a-gradual-approach", title: "Returning to running after injury: a gradual approach",
    dek: "Why most return-to-running plans build volume before speed, and the signs that you are moving too fast.", specialty: "sports", tags: ["running", "return to sport"],
    reviewer: REVIEWER,
    body: `## Start from where you are\n\nA return-to-running plan is set after an assessment of strength, range and pain behaviour. The principles below are general; your physiotherapist will set the specific numbers.\n\n## Volume before intensity\n\nWalk-run intervals are a common first step, increasing running time gradually over weeks. Speed work and hills usually come later, once continuous running is comfortable.\n\n## Signs to slow down\n\n- Pain that rises during a run and does not settle by the next morning\n- New swelling or a change in the way you run\n- Needing to change your stride to avoid pain\n\n## Strength matters\n\nCalf, hip and trunk strength work is often continued alongside running. It is not a replacement for a gradual plan, but it supports it.${DISCLAIMER}`,
    faqs: [{ question: "Is some discomfort normal when restarting?", answer: "Mild, short-lived discomfort that settles quickly is common. Pain that builds during a run or lingers into the next day is a reason to pause and speak to your physiotherapist." }],
    sources: [SRC_WHO],
  },

  // ---------------------------------------------------------------- conditions
  {
    kind: "condition", slug: "low-back-pain", title: "Low back pain", specialty: "spine", tags: ["spine"],
    dek: "Most low back pain is not caused by serious disease and improves with staying active. Here is how physiotherapy fits in and when to seek urgent help.",
    reviewer: REVIEWER,
    condition: {
      alsoKnownAs: ["Lumbago", "Non-specific low back pain"],
      symptoms: ["Aching or stiffness across the lower back", "Pain that changes with posture or activity", "Pain that may spread to the buttock or thigh"],
      commonCauses: ["Sustained postures and low activity", "Sudden lifting or awkward movement", "Age-related change in discs and joints"],
      whenToSeek: ["Pain has lasted more than two weeks or keeps returning", "Pain limits work, sleep or daily tasks", "You want a plan to stay active safely"],
      physiotherapyHelps: ["Assessment to rule out causes that need a doctor", "Graded movement and strengthening", "Advice on posture, pacing and return to activity"],
      redFlags: ["Pain after a significant fall or accident", "Unexplained weight loss or a history of cancer with new back pain"],
      bodyArea: "Lumbar spine",
    },
    body: `## What is going on\n\nMost low back pain is classed as non-specific: the exact tissue source cannot be pinned down and it is not a sign of serious disease. It usually improves over weeks.\n\n## What physiotherapy involves\n\nAfter assessment, treatment typically centres on staying active, graded exercise and advice about work and daily tasks. Hands-on techniques may be used alongside exercise, not instead of it.\n\n## Scans\n\nImaging is not routinely needed for non-specific low back pain and can show age-related changes that are common in people without pain.${DISCLAIMER}`,
    faqs: [{ question: "Should I rest in bed?", answer: "Prolonged bed rest is not recommended for most low back pain. Gentle movement and a gradual return to normal activity usually help recovery." }],
    sources: [SRC_NICE_LBP, SRC_WHO],
  },
  {
    kind: "condition", slug: "frozen-shoulder", title: "Frozen shoulder", specialty: "ortho", tags: ["shoulder"],
    dek: "A stiff, painful shoulder that develops over months. Recovery is slow but usual; physiotherapy focuses on pain control and regaining movement.",
    condition: {
      alsoKnownAs: ["Adhesive capsulitis"],
      symptoms: ["Deep shoulder ache, often worse at night", "Progressive stiffness, especially reaching behind or overhead", "Difficulty with dressing and grooming"],
      commonCauses: ["Often no clear trigger", "More common with diabetes and thyroid conditions", "Can follow a period of immobility after injury or surgery"],
      whenToSeek: ["Shoulder stiffness has been increasing for several weeks", "Night pain is disturbing sleep", "You cannot reach behind your back or overhead"],
      physiotherapyHelps: ["Pain-relief strategies and activity modification", "Range-of-motion exercises matched to the stage of the condition", "Strengthening as movement returns"],
      redFlags: ["Shoulder deformity or inability to move the arm after a fall"],
      bodyArea: "Shoulder",
    },
    body: `## Stages\n\nFrozen shoulder is usually described in phases: a painful phase, a stiff phase and a recovery phase. The whole course can take a year or more.\n\n## What physiotherapy involves\n\nTreatment is matched to the phase — pain management and gentle movement early, more progressive stretching and strengthening later. Your physiotherapist may discuss other options with your doctor if progress is slow.${DISCLAIMER}`,
    sources: [SRC_WHO],
  },
  {
    kind: "condition", slug: "acl-rehabilitation", title: "ACL rehabilitation", specialty: "sports", tags: ["knee", "sports"],
    dek: "Rehabilitation after an anterior cruciate ligament injury or reconstruction is staged over months, with return to sport decided by tests rather than the calendar.",
    reviewer: REVIEWER,
    condition: {
      alsoKnownAs: ["Anterior cruciate ligament rehabilitation", "Post-ACL reconstruction physiotherapy"],
      symptoms: ["Knee giving way or feeling unstable", "Swelling after activity", "Difficulty with pivoting, jumping or landing"],
      commonCauses: ["Non-contact twisting injuries in sport", "Landing awkwardly from a jump", "Direct contact to the knee"],
      whenToSeek: ["After a knee injury with swelling or instability", "Before and after ACL surgery", "When planning a return to sport"],
      physiotherapyHelps: ["Restoring range and quadriceps control early", "Progressive strength and neuromuscular training", "Objective return-to-sport testing"],
      redFlags: ["Hot, swollen calf or chest pain after surgery", "Fever or wound redness after surgery"],
      bodyArea: "Knee",
    },
    body: `## Surgery or not\n\nSome people manage well without surgery with structured rehabilitation; others benefit from reconstruction. That decision is made with an orthopaedic surgeon.\n\n## Phases of rehabilitation\n\nEarly goals are swelling control, full extension and muscle activation. Middle phases build strength and balance. Late phases add running, agility and sport-specific drills. Return to sport is guided by strength and hop tests compared with the other leg, not a fixed date.${DISCLAIMER}`,
    faqs: [{ question: "How long until I can play again?", answer: "Commonly nine months or more after reconstruction, but the decision is based on tests of strength, control and confidence rather than time alone." }],
    sources: [SRC_WHO],
  },
  {
    kind: "condition", slug: "plantar-fasciitis", title: "Plantar fasciitis", specialty: "ortho", tags: ["foot"],
    dek: "Heel pain that is worst with the first steps of the day. Most cases settle with load management, calf and foot exercises and footwear changes.",
    condition: {
      alsoKnownAs: ["Plantar heel pain", "Plantar fasciopathy"],
      symptoms: ["Sharp heel pain on first steps after rest", "Pain that eases with walking then returns after long standing", "Tenderness under the heel"],
      commonCauses: ["Sudden increase in walking, running or standing", "Reduced calf flexibility", "Unsupportive footwear on hard floors"],
      whenToSeek: ["Heel pain has lasted more than a few weeks", "Pain is changing how you walk", "Home measures have not helped"],
      physiotherapyHelps: ["Graded loading of the calf and plantar fascia", "Footwear and activity advice", "Taping or temporary insoles where appropriate"],
      bodyArea: "Foot and ankle",
    },
    body: `## What is going on\n\nThe plantar fascia is a thick band under the foot. Irritation where it attaches to the heel causes the typical first-step pain.\n\n## What physiotherapy involves\n\nAssessment looks at calf flexibility, foot mechanics and training load. Treatment is mostly exercise-based with footwear and activity advice. Recovery is often measured in months.${DISCLAIMER}`,
    sources: [SRC_WHO],
  },
  {
    kind: "condition", slug: "cervical-spondylosis", title: "Cervical spondylosis", specialty: "spine", tags: ["neck", "spine"],
    dek: "Age-related change in the neck that is very common and often painless. When it causes symptoms, physiotherapy focuses on movement, strength and posture.",
    condition: {
      alsoKnownAs: ["Neck arthritis", "Degenerative cervical spine change"],
      symptoms: ["Neck stiffness and ache", "Pain spreading to the shoulder blade or arm", "Headaches starting at the base of the skull"],
      commonCauses: ["Normal age-related change in discs and joints", "Sustained desk or screen postures", "Previous neck injury"],
      whenToSeek: ["Neck pain persisting beyond a few weeks", "Arm pain, tingling or weakness alongside neck pain", "Pain limiting work or sleep"],
      physiotherapyHelps: ["Mobility and strengthening for the neck and upper back", "Posture and workstation advice", "Monitoring of nerve symptoms"],
      redFlags: ["Progressive arm or leg weakness, clumsiness of the hands or changes in walking"],
      bodyArea: "Cervical spine",
    },
    body: `## A common finding\n\nX-ray changes of cervical spondylosis are present in most people over 60, many of whom have no symptoms. The findings alone do not predict pain.\n\n## What physiotherapy involves\n\nAssessment distinguishes neck pain from nerve involvement. Treatment usually combines exercise, advice and, where helpful, hands-on techniques. Nerve symptoms are monitored and referred on if they progress.${DISCLAIMER}`,
    sources: [SRC_WHO],
  },
  {
    kind: "condition", slug: "rehabilitation-after-knee-replacement", title: "Rehabilitation after knee replacement", specialty: "post_surgical", tags: ["knee", "post-surgical"],
    dek: "Recovery after total knee replacement follows a staged plan: early movement and walking, then strength and confidence over several months.",
    condition: {
      alsoKnownAs: ["Total knee arthroplasty rehabilitation", "TKR physiotherapy"],
      symptoms: ["Post-operative swelling and stiffness", "Difficulty bending or straightening the knee fully", "Reduced walking confidence"],
      commonCauses: ["Surgery for advanced knee osteoarthritis", "Surgery after joint damage from injury or inflammatory arthritis"],
      whenToSeek: ["Immediately after surgery, as advised by the surgical team", "If knee bend or straightening is not progressing", "When planning return to work, driving or travel"],
      physiotherapyHelps: ["Restoring knee range and walking pattern", "Progressive strengthening and balance work", "Guidance on stairs, driving and daily tasks"],
      redFlags: ["Hot, swollen calf or chest pain", "Fever, wound discharge or spreading redness"],
      bodyArea: "Knee",
    },
    body: `## The first weeks\n\nEarly goals are controlling swelling, regaining knee straightening and bend, and walking safely with an aid. Exercises are frequent and short.\n\n## Weeks six to twelve and beyond\n\nStrength, balance and stamina build gradually. Most people see continued improvement for a year. Your surgical team's instructions take precedence over any general guidance.${DISCLAIMER}`,
    sources: [SRC_NICE_OA, SRC_WHO],
  },

  // ---------------------------------------------------------------- news
  {
    kind: "news", slug: "test-preview-content-system-live", title: "TEST: Preview content system is live on The Physio Index", newsCategory: "Platform",
    dek: "Fictional item used on preview deployments to exercise the news template. Not a real announcement.",
    body: `This is a fictional news item created by the preview seed. It exists so the news list, article page, RSS feed and JSON-LD can be checked before real content is published.\n\nNothing here describes a real event.`,
    sources: [{ title: "The Physio Index requirements (SRS v1.0)", url: "https://www.thephysioindex.com/", publisher: "The Physio Index" }],
  },
  {
    kind: "news", slug: "test-fictional-council-register-update", title: "TEST: Fictional state council publishes updated register", newsCategory: "Regulation",
    dek: "Fictional regulatory item to exercise the correction notice on preview deployments.",
    body: `A fictional allied and healthcare council has published an updated register of physiotherapists in this made-up story.\n\nThe item carries a correction so the CorrectionComment rendering can be checked.`,
    sources: [{ title: "Fictional council website", url: "https://example.com/fictional-council", publisher: "Example" }],
    correction: "An earlier version of this fictional item gave the wrong month for the register update. It has been corrected.",
  },
  {
    kind: "news", slug: "test-fictional-research-summary", title: "TEST: Fictional research summary on exercise and knee pain", newsCategory: "Research",
    dek: "Fictional research item used to exercise category filtering on preview deployments.",
    body: `In this fictional item, a made-up study is summarised to test the news template. No real research is described.`,
    sources: [{ title: "Example journal (fictional)", url: "https://example.com/fictional-journal", publisher: "Example" }],
  },
];
