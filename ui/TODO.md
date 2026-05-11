Several Issues (you have skills for doing proper work right?):

- ~~Review Onboarding Manually~~
  - ~~Does profile danger zone reset onboarding~~ — **DONE** (Phase 5 of B+D+F+P cleanup). ResetProfileDialog now has an "Also reset onboarding state" checkbox; the 'everything' scope force-on it. `data/onboarding-state.json` is backed up to `.bak` before deletion.

- Multi-user + Profiles + Login/Logout (Full User Flow & Account Creation/Deletion). I'm sure you understand the perfect/entirety of what is needed

- Profile
  - Avatar
  - Username
  - Appearance
  - Themes
  - Notifications

- For UX
  - Do we need the "Liveness check" UX stuff since its automated?
  - Apply system
    - Can we merge all of the LinkedIn Easy Apply UX/logic and apply logic so everything can be automatic as in a single "Apply to job" button/logic that will work everywhere for every source?

- Automatically Apply

- The entire point of this system is full end-to-end to get and pass interviews and land a job. So beat ATS systems + interviewers/etc as the job market is completely fucked.
- Think of all the things that are actual relevant that people want to know applying for jobs and where/how that can be shown across the entire ux and present all the options/choices

- Backup System + Restore

- Electron app/ios app/notifications: Full standard/best practice + automation for everything for dev
  - Electron
    - AppMenuBar
    - MenuBar
    - Notifications
    - All Meta/etc