# Repo + product rename — external steps

> Renaming the brand requires changes OUTSIDE the repo that
> `apply-brand` can't make for you. This document is the checklist.
>
> Pair this with [`REBRAND-PROCESS.md`](./REBRAND-PROCESS.md) (the
> in-repo ceremony) + a freshly generated `MIGRATION-<date>.md`
> (auto-emitted when destructive fields change). Together they
> cover everything.

## When you reach this document

You've already done the in-repo work:

```sh
$EDITOR branding/brand.json    # change identity / identifiers
REBRAND_CONFIRMED=1 pnpm brand:apply
git add branding/brand.json branding/.brand-snapshot.json branding/MIGRATION-*.md
git commit -m "feat(brand)!: rebrand to <NewName>"
```

Now: the external systems.

## 1. Local working tree

The git remote URL inside the repo points at the OLD GitHub coordinates
because the actual GitHub rename hasn't happened yet. Until then,
clones / fetches still use the old URL (GitHub redirects gracefully).

When ready:

```sh
# 1. Rename the GitHub repo via the web UI:
#    Settings → Repository name → <new-name> → Rename.
#    Or via gh CLI:
gh repo rename <new-name> --repo <old-owner>/<old-name>

# 2. If also moving to a new GitHub org:
#    Transfer ownership via Settings → Transfer → confirm the new org.
#    The new org must exist first.

# 3. Update the local remote URL:
git remote set-url origin git@github.com:<new-owner>/<new-name>.git
git remote -v

# 4. Optional: rename the local working tree directory:
mv ~/<old-dir> ~/<new-dir>
cd ~/<new-dir>
```

GitHub auto-redirects the old URL for ~90 days, but external bookmarks
/ blog posts / press references should be updated.

## 2. App Store Connect (iOS)

**Bundle ID is locked.** This is the most important external constraint
of a rebrand. Apple does not allow changing the bundle ID of a
published app.

Options when the bundle ID changes:

- **Keep the old app as legacy.** The old App Store entry stays
  alive at the old bundle ID. Reviews, ratings, TestFlight history,
  download counts all stay with it. The new bundle ID gets a fresh
  App Store Connect entry.
- **Mark old as deprecated.** Apple supports "Removed from sale"
  status — users who already installed keep using it; new users
  can't find it.
- **In-app migration banner** on the old app pointing users at the
  new App Store entry (manual code; not covered by apply-brand).

App Store Connect steps for the new bundle ID:

1. App Store Connect → My Apps → "+ New App"
2. Bundle ID = pick the new value (must match
   `brand.json::identifiers.bundleId`)
3. Re-upload screenshots, metadata, privacy nutrition labels.
4. Re-invite TestFlight testers (cannot migrate from old app's
   tester pool).
5. Submit for review.

ASO (App Store Optimization) implications: keyword history, ranking,
click-through-rate data resets. Plan to lose 2-4 weeks of ASO
performance during the transition.

## 3. Google Play Console (Android)

`applicationId` is locked the same way as iOS bundle ID. Same plan:

- Old `applicationId` stays as legacy.
- New `applicationId` = new Play Console listing.
- Re-upload AAB, metadata, screenshots.
- Re-invite internal testers.

## 4. DNS + email + domains

If `brand.json::homepageUrl` / `supportEmail` changes domain:

- Register the new domain (if not already).
- DNS: add A/AAAA/CNAME records for the new website, MX for email.
- Email forwarding: `hello@<newbrand>` → existing mailbox.
- SPF / DKIM / DMARC records on the new domain.
- Move any landing page hosting (Vercel / Netlify / GitHub Pages) to
  the new domain.

## 5. OAuth / Better Auth callbacks

Better Auth's GitHub OAuth integration uses callback URLs scoped to
the OAuth app. If the OAuth app's name / homepage changes:

- GitHub OAuth Apps → Settings → update Application name + Homepage
  URL.
- Authorization callback URL: keep the existing values unless the
  underlying domain changes (the callback uses the website domain).
- Generate new client secret (recommended on rebrand — invalidates
  any leaked secret).

Other integrations (Stripe, Sentry, Linear, Discord, etc.) likely
need similar profile updates.

## 6. Discord server

- Server Settings → Overview → server name.
- Update invite link description.
- Update channel topics / category names referencing the old brand.
- Bot integrations: GitHub webhooks pointing at Discord may need
  re-authorizing under the new repo URL.

## 7. Search engines + SEO

- Google Search Console: add the new domain as a separate property.
- Sitemap: regenerate if the marketing site moved.
- 301 redirects from old domain → new domain (preserves SEO equity).
- Update structured data (schema.org JSON-LD) referencing the brand.

## 8. Social handles

- Twitter / X handle change (if available).
- LinkedIn page rename.
- GitHub org rename (if owning an org, not a personal repo).
- Mastodon / Bluesky handles.
- npm package name change (if published — `npm deprecate` the old,
  publish under the new).

## 9. Trademark / legal

If the brand is registered as a trademark:

- USPTO TEAS application for the new name.
- Domain ownership + protection (typo-squat watching service).
- Update LICENSE copyright holder if the legal entity changes.
- `docs/TRADEMARK.md` policy text references the brand by name —
  apply-brand regenerates the relevant data sections; the narrative
  may need a manual sweep.

## 10. Notify existing users

- Email blast to the user mailing list (if any).
- In-app banner on the OLD bundle ID app pointing users at the new
  App Store / Play Store entry.
- Blog post on the website explaining the rename.
- Update README "Notice" section (apply-brand can take this as
  AUTO-GENERATED data from a `brand.json::voice.rebrandNotice` string
  added for the rename).

## Verification checklist

After running through the above, verify:

- [ ] `git remote -v` shows the new URL.
- [ ] `cd <new-dir> && pnpm brand:apply` runs cleanly (no drift).
- [ ] `pnpm exec vitest run capacitor.integration.test.ts` passes.
- [ ] iOS simulator launches under the new bundle ID:
      `cd ui && pnpm exec cap run ios`
- [ ] Android emulator launches under the new applicationId:
      `cd ui && pnpm exec cap run android`
- [ ] Web manifest theme color, app name, icon all updated:
      visit `http://localhost:5173` and inspect the head.
- [ ] App Store Connect new entry exists + is "Ready for Submission".
- [ ] Play Console new entry exists + has an internal-test build.
- [ ] DNS resolves for the new domain.
- [ ] OAuth callbacks work end-to-end.
- [ ] Discord server has the new name.
- [ ] Social handles updated where available.
- [ ] Search Console knows about the new domain.

Each box is something `apply-brand` cannot do for you — they require
external system credentials or human-in-the-loop decisions.
