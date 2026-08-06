# Dietary V1 Device Readiness Checklist

**Product:** LTC Manager  
**Scope:** Shared tablets and Supervisor/GM browsers for the Dietary controlled pilot  
**Companion:** `docs/pilot/DIETARY_V1_EMPLOYEE_TABLET_GUIDE.md`, fallback guide

Do not claim remote wipe while a device is offline.

---

## Supported client policy

| Item | Pilot policy |
|------|----------------|
| Supported browser | Current Chromium-based stable (Chrome / Edge) — matches CI Playwright Chromium gates |
| Minimum version | Latest stable minus 2 major versions; validate on each device model before Stage 1 |
| Tablet OS | Current iPadOS or Android tablet channel used on site; pin a tested build for Stage 1 |
| Desktop Supervisors/GM | Same Chromium policy on Facility-managed machines |
| Unsupported | Unvalidated legacy browsers; private WebViews that block service workers |

---

## PWA / browser behavior

- [ ] Site served only over HTTPS on the pilot domain  
- [ ] `/manifest.webmanifest` loads  
- [ ] `/sw.js` registers with scope `/`  
- [ ] Icons load (`/icons/icon-192.svg`, `/icons/icon-512.svg`)  
- [ ] Add to Home Screen / install PWA succeeds on the tablet OS  
- [ ] Home-screen launch opens the pilot origin (not a stale URL)  
- [ ] Full-screen / guided access / kiosk mode configured per Facility policy  
- [ ] Service-worker update: after deploy, hard-refresh one device and confirm new SW activates without caching protected HTML/API  

---

## Enrollment and binding

- [ ] Device labeled (asset tag ↔ Unit / servery)  
- [ ] Facility Administrator binds device to Facility + Unit  
- [ ] STAFF Quick PIN login succeeds only for eligible roles  
- [ ] Supervisor password login works on Supervisor devices (not shared PIN pads for password roles)  
- [ ] Sign-out clears session; next user must authenticate  
- [ ] Unit binding visible on tablet bootstrap surface  
- [ ] Unbind / rebind tested; prior offline commands are not silently retargeted  

---

## PIN and session privacy

- [ ] Screen positioned to reduce shoulder surfing  
- [ ] Auto screen timeout / lock per Facility policy  
- [ ] Shared-device sign-out expected between users when policy requires  
- [ ] No password-required roles using Quick PIN  
- [ ] Session revocation tested (disabled user cannot continue)  

---

## Physical and network

- [ ] Physical security: tether / locked cart / supervised storage  
- [ ] Charging plan for all meal periods  
- [ ] Battery health acceptable (≥ Facility threshold)  
- [ ] **On-site Wi-Fi walkthrough completed** for every servery / Unit in scope (signal at work surface, not only corridor)  
- [ ] Captive portal / guest Wi-Fi quirks documented  
- [ ] Cellular fallback: only if Facility-approved and tested; otherwise document “Wi-Fi only”  
- [ ] Dead zones mapped; paper process ready there  

---

## Offline queue recovery

- [ ] Airplane-mode drill: queue Servery Ready / Meal Service Started  
- [ ] Restore network: sync succeeds  
- [ ] Conflict path understood by Supervisors  
- [ ] If tablet lost while offline: assume queue may be unrecoverable — paper reconcile; revoke device binding  

---

## Lost, stolen, or replacement

| Event | Action |
|-------|--------|
| Lost/stolen | Unbind device; revoke sessions for users known on that device; rotate PINs if exposure suspected; file Facility incident |
| Replacement | New asset tag; bind new device; do not reuse old binding blindly; re-run enrollment checklist |
| Offline lost device | **No remote wipe guarantee** while offline; treat data on device as potentially exposed |

---

## Pre-Stage gate

Stage 1 cannot start until:

- [ ] Wi-Fi walkthrough signed by pilot owner  
- [ ] At least two shared tablets pass this checklist  
- [ ] One Supervisor device passes  
- [ ] Offline drill recorded  
- [ ] Lost-device procedure acknowledged  
