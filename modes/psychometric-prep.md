# Psychometric test prep -- gate-clearing for Pymetrics / Plum / Harver / etc.

Behavioural + cognitive tests are a real gate at F500 / consulting /
big tech entry-level. Unlike technical interviews, you can't "practice
the answers" -- these tests measure traits, not knowledge. But you CAN
practice technique + understand what each test rewards.

## Inputs ($args, parsed from `PSYCHOMETRIC_PREP_INPUT` env JSON)

- `profileId`, `jobId` (optional -- when present, links to the job)
- `testIdentifier` -- one of: `pymetrics`, `plum`, `harver`, `cangrade`,
  `wonderlic`, `berke`, `predictive-index`, `hogan`, `caliper`,
  `criteria-cognitive-aptitude`, `revelian`, `koru7`, `arctic-shores`,
  `unknown`
- `inviteText` -- the test invitation email or URL the user pasted (we
  use this to detect the test if `testIdentifier === 'unknown'`)
- `dueDate` -- ISO date when the test expires (for timing advice)

## Detection -- when testIdentifier is 'unknown'

Detect from `inviteText`:
- `pymetrics.ai` / "pymetrics" / "12 gamified tasks" → pymetrics
- `plum.io` / "Plum" / "Discovery Survey" → plum
- `harver.com` / "Harver" / "match score" → harver
- `cangrade.com` / "Cangrade" → cangrade
- `wonderlic.com` / "Wonderlic Personnel Test" / "WPT" / "12-minute" → wonderlic
- `berkeassessment.com` / "Berke" → berke
- `predictiveindex.com` / "Predictive Index" / "PI Behavioral" → predictive-index
- `hoganassessments.com` / "Hogan Personality Inventory" → hogan
- `calipercorp.com` / "Caliper Profile" → caliper
- `criteriacorp.com` / "Criteria Cognitive Aptitude Test" / "CCAT" → criteria-cognitive-aptitude
- `revelian.com` / "Revelian Cognitive Ability" → revelian
- `koru.co` / "Koru7 Fingerprint" → koru7
- `arcticshores.com` / "Arctic Shores" → arctic-shores

## Output

ONE markdown file at:

```text
__OUTPUT__/psychometric-{testIdentifier}-prep.md
```

Format:

```markdown
# {Test name} prep · {company}

_Read this 30 min before the test. Don't cram. The tests measure
traits — gaming them backfires._

## What this test actually measures

_(2-3 sentences. Be specific. Pymetrics ≠ Wonderlic ≠ Hogan.)_

## What the company is screening for

_(1-2 sentences. Based on the role + test: a high-conscientiousness
profile? high cognitive speed? specific Big-5 dimensions?)_

## Technique — what works

_(Test-specific technique tips. NOT cheats. Things like:
  Pymetrics — bias toward risk-taking in the balloon game; the system
  rewards calibrated risk, not extreme caution.
  Wonderlic — pace at 25 sec / question; don't second-guess.
  Plum — answer fast + consistently; the test detects inconsistency.
  Hogan — answer honestly; the "lie scale" catches obvious gaming.
)_

## Common traps

_(2-3 specific anti-patterns for this test.)_

## Pre-test logistics

- **Time required:** {duration from test docs}
- **Best time of day:** {when you're sharpest — morning for cognitive
  tests; afternoon for trait tests where calm = good signal}
- **Equipment:** {webcam needed? sound? specific browser?}
- **Environment:** {quiet, no distractions, good lighting if webcam}
- **Hydration / food:** {real signal — dehydration = -10% on cognitive
  tests; avoid caffeine spike before trait tests}

## Practice resources

_(Public, legal, free where possible. NEVER recommend cheat sites.)_

- {URL to publisher's official practice}
- {URL to free academic Big-5 / cognitive test for warm-up}

## If you're not comfortable with this test type

_(One paragraph: it's OK to push back if the test seems mis-calibrated
for the role. Phrase: "I'd love to chat about how the test relates to
the role before completing it — what specific traits is it screening
for?")_
```

After writing the file, emit:

```yaml
PSYCHOMETRIC_PATH: {relative-path}
```

## Test-specific knowledge base

### pymetrics
- 12 mini-games measuring 91 cognitive + emotional traits
- Compared against the company's "success profile" (current top performers)
- Risk-taking, attention, learning, memory, fairness, generosity all measured
- ~25 min total
- Key technique: don't game; answer consistently; the system flags inconsistency more than poor performance

### plum
- 25-min Discovery Survey
- Measures: cognitive aptitude, personality, social intelligence
- "Match score" computed against the role
- Key technique: answer fast (gut response); the survey detects deliberation

### harver
- Multi-module: behavioural assessment + situational judgment + cognitive
- "Match score" with 0-100 fit
- Some companies show your score; many don't
- Key technique: situational judgment questions -- pick the BUSINESS answer, not the heroic one

### wonderlic / WPT / Wonderlic Personnel Test
- 50 questions in 12 minutes -- strict speed test
- Math, vocab, logic, spatial
- Higher scores correlate with role complexity but only weakly
- Key technique: skip + return; never spend > 30 sec on one Q

### hogan (HPI / HDS / MVPI)
- Personality + derailers + values
- Used by 75% of Fortune 500 for leadership roles
- HPI = "bright side"; HDS = "dark side under stress"; MVPI = "what motivates you"
- Key technique: be HONEST; lie scale is real; consistency across 200+ questions matters

### predictive-index / PI Behavioral
- ~10 min, 2 lists of adjectives (self-description + how others see you)
- Measures: dominance, extraversion, patience, formality
- Key technique: be honest; companies use PI to match you to the role's "target", honesty serves you here

### caliper
- 180 questions, 1 hour
- 25 personality traits + cognitive abilities
- Heavily used in sales/services hiring
- Key technique: pace; don't fatigue in last 60 questions

### criteria-cognitive-aptitude / CCAT
- 50 questions in 15 minutes
- Math, verbal, spatial
- Adaptive -- wrong answers make it harder
- Key technique: skip + return; quick + accurate beats deep + slow

### revelian / arctic-shores / koru7 / berke / cangrade
- Less common. Follow the technique advice in their official prep docs.
- Default: pace evenly, answer consistently, be honest on trait questions.

## Quality bar

- NEVER claim to know "the right answers" -- these tests measure traits,
  not knowledge. Cheating backfires (lie-scale, consistency checks).
- Always recommend the OFFICIAL practice site over third-party "answer
  banks" (those are usually scams + signal "I tried to game this").
- Include the publisher URL when known.
- Calibrate to the role: cognitive tests reward speed for IC roles, but
  for senior/leadership roles the company is reading the personality
  profile more than the cognitive score.
