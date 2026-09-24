# Privacy Policy for Dumbify

**Effective date:** September 2, 2026
**Last updated:** September 24, 2026

This Privacy Policy describes how the Dumbify browser extension ("Dumbify", "the
extension") handles information. Please read it before installing or using the
extension.

## 1. Who is responsible

Dumbify is published by Eden Rebello ("we", "us"), the data controller for
the purposes of this policy. Contact details are provided in Section 11.

## 2. Scope

This policy applies solely to the Dumbify browser extension. It does not apply to
youtube.com, to Google LLC, or to any other website or service you may access
while the extension is installed. Your use of YouTube remains governed by
[Google's Privacy Policy](https://policies.google.com/privacy).

## 3. Information we collect

We collect no information.

Dumbify operates entirely within your browser. It has no backend server, no
account system, and no mechanism by which information could be transmitted to us.
We do not receive, store, or have access to any data about you or your use of the
extension.

Specifically, Dumbify does not collect, and we do not receive: personally
identifiable information; authentication credentials or session tokens; browsing
or watch history; search queries; financial or payment information; health
information; personal communications; location data; or device identifiers.

## 4. Information stored on your device

Dumbify stores your display preferences locally on your device using Chrome's
extension storage API (`chrome.storage.local`). These preferences comprise: the
on/off switch; theme, mode and accent colour; font, text size, line spacing and
text colours; layout choices (feed layout, page width, sidebar, density, corners,
which video details are shown, watch-page layout); wallpaper settings; and the
wallpapers you upload - up to six images, animations or videos, each kept as you
picked it (still images are resized and re-compressed first) with a small
thumbnail and its main colours. Deleting an upload from the wallpaper gallery
removes it from storage; resetting your settings leaves your uploads in the
gallery until you delete them.

So that pages open in your theme without a flash of the default one, Dumbify also
keeps a small copy of the resulting colours and layout names in the browser's
local storage for `youtube.com`, and for the extension's own pages. This copy
contains no wallpaper and nothing about you or your use of YouTube.

This information remains on your device. It is not transmitted to us or to any
third party, is not synchronised across your devices, and is not accessible to
us at any time. Exporting a settings backup writes the same preferences to a file
on your device that you choose; Dumbify does nothing further with it.

## 5. Interaction with YouTube

Dumbify runs only on pages under `https://www.youtube.com/`. On those pages it
reads data that YouTube has already delivered to your browser and issues requests
to YouTube's own endpoints, including its InnerTube API, in order to display
videos, search results, comments, and subscription status.

These requests are directed exclusively to YouTube and are equivalent in
destination to those youtube.com issues on its own behalf. Your browser attaches
your existing YouTube session cookies to them, as it does for any request to that
domain. Consequently, where you are signed in to YouTube, Google receives those
requests as originating from your account.

For actions requiring authentication, such as posting a comment or subscribing to
a channel, Dumbify computes a request authorisation header derived from your
existing session cookie. This value is computed in memory at the time of the
request and is not stored, logged, copied, or transmitted to any party other than
YouTube.

Dumbify transmits no data to any destination other than YouTube. It contains no
analytics, telemetry, crash reporting, advertising, or tracking functionality of
any kind.

## 6. Permissions

Dumbify requests the minimum permissions necessary to function:

| Permission | Purpose |
| --- | --- |
| `storage` | To save your display preferences locally on your device. |
| `unlimitedStorage` | To let a wallpaper animation or video larger than Chrome's default 10 MB extension storage allowance be saved locally. It grants no access to anything else. |
| `scripting` | To read YouTube's own page data (`ytInitialData`, `ytcfg`) in order to render the simplified view. |
| Host access to `https://www.youtube.com/*` | To operate on YouTube pages. The extension has no access to any other website. |

## 7. Disclosure, transfer, and sale of information

We do not sell, share, rent, transfer, or otherwise disclose personal information,
because we do not collect any. We do not use any information for purposes
unrelated to the extension's single stated function, and we do not use or
transfer information for the determination of creditworthiness or for lending
purposes.

## 8. Retention, deletion, and your rights

Preferences stored under Section 4 are retained on your device until you delete
them. You may return your preferences to their defaults at any time with the reset
control on the extension's options page, and delete any uploaded wallpaper from the
wallpaper gallery on the same page. Clearing the extension's storage through your
browser's settings, or uninstalling the extension, deletes all of it permanently.

Because we hold no personal data concerning you, there is no data against which
rights of access, rectification, erasure, portability, restriction, or objection
under the EU/UK General Data Protection Regulation, or rights to know, delete, or
opt out of sale under the California Consumer Privacy Act, could be exercised. You
retain full and direct control over the locally stored preferences described
above. Should you wish to raise any question regarding your rights, you may
contact us using the details in Section 11.

## 9. Security

Because Dumbify neither transmits nor retains information outside your device,
the data described in Section 4 is protected by your browser's own extension
storage isolation and by the security of your device. We hold no information
that could be exposed by a compromise of our systems, as no such systems exist.

## 10. Children's privacy

Dumbify is not directed to children under the age of 13, and we knowingly collect
no information from any user, irrespective of age.

## 11. Contact

Questions or concerns regarding this Privacy Policy may be directed to:

edenvrebello@gmail.com

## 12. Changes to this policy

We may update this Privacy Policy from time to time. Any revised version will be
posted at this URL bearing an updated "Last updated" date, and where the changes
are material, we will indicate this in the extension's release notes. Continued
use of the extension following the posting of a revised policy constitutes
acceptance of it.

## 13. Verification

Dumbify is open source. Every statement in this policy may be independently
verified by inspecting the source code:

https://github.com/edenreb/dumbify
