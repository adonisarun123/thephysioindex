# Blog posts (published from the repo)

Each `.md` file here becomes a guide at `/blog/<slug>` on the next deploy. `scripts/publish-posts.ts` runs in `npm run build:vercel`, after the seeds, on production and previews.

Merging the pull request that adds a post is the publishing approval.

## File format

File name: `YYYY-MM-DD-short-name.md`. The YAML front matter is validated on every build, and a bad file fails the build.

```yaml
---
slug: lower-case-words-with-hyphens        # max 90 chars, unique
title: "Question- or benefit-led title"     # 10–110 chars
dek: "One-sentence summary, used as the meta description"  # 50–170 chars
audience: patients | physiotherapists      # adds tag for-patients / for-physiotherapists
publishOn: 2026-11-11                       # IST date; future dates stay draft until a build on/after it
specialty: ortho                            # optional, specialties.code
tags: [knee, stairs]
faqs:                                       # 3–6, also rendered as FAQPage JSON-LD
  - question: "…?"
    answer: "…"
sources:                                    # real, checked URLs only
  - title: "…"
    url: "https://…"
    publisher: "…"
---
Markdown body, at least 600 words. Use H2/H3, no H1.
```

## Editorial rules

- **Patients:** general education only. No diagnosis, no dosing, no named drugs, no exercise prescriptions with sets/reps. Always include when to get urgent help and the closing disclaimer. Cite NHS, NICE, WHO, Versus Arthritis or peer-reviewed sources. Posts show "Not yet clinically reviewed" until a credentialed reviewer approves them in Admin (SEO-04). Condition pages are not published this way.
- **Physiotherapists:** practical and accurate (registration, setting up practice, getting patients). Claim only what the practitioner pages state, for example "no listing fee or commission at launch" and no paid ranking. End with a link to `/for-physiotherapists/join`.
- No invented statistics, testimonials or quotes. Write "as reported" when relying on news coverage.
- Internal links: `/physiotherapists`, `/for-physiotherapists/join`, `/blog/<slug>`.
- Do not reuse slugs from the Admin editorial batch: `how-to-choose-a-physiotherapist-in-india`, `what-to-expect-at-your-first-physiotherapy-appointment`, `physiotherapy-at-home-or-clinic`, `work-from-home-desk-setup-neck-back-pain`.

## Changing or removing a post

- Editing a file updates the live post on the next deploy and clears any clinical review, because the reviewed text changed.
- To take a post down, withdraw it in Admin → Content → Blog. The repo never republishes a withdrawn post.
