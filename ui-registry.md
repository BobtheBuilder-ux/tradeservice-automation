### Utility Test Forms

File: frontend/pages/test-lead.js
Last updated: 2026-06-17

| Property         | Class                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Background       | bg-gray-50, bg-white                                                  |
| Border           | border border-gray-200                                                |
| Border radius    | rounded-md, rounded-lg through shared card/form classes               |
| Text — primary   | text-gray-950, text-gray-800                                          |
| Text — secondary | text-gray-600, text-gray-700                                          |
| Spacing          | px-4 py-8, card-body space-y-6, grid gap-4                            |
| Hover state      | hover:bg-gray-800, hover:bg-gray-200 through shared button classes    |
| Shadow           | shadow-sm through shared card class                                   |
| Accent usage     | green success panels, red error panels, gray admin badge and controls |

**Pattern notes:**
Utility test forms use a constrained `max-w` page shell, one primary card, compact labels, shared `.form-input`/`.form-select`, icon+text action buttons, and bordered status panels. Keep future test tools in this quiet gray/white dashboard style with green success and red error feedback.

### Live Automation Test Form

File: frontend/pages/live-automation-test.js
Last updated: 2026-06-18

| Property         | Class                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Background       | bg-gray-50, bg-white                                                  |
| Border           | border border-gray-200, border-red-200, border-yellow-200             |
| Border radius    | rounded-md through shared card/form classes                           |
| Text — primary   | text-gray-950, text-gray-900, text-gray-800                           |
| Text — secondary | text-gray-500, text-gray-600, text-gray-700                           |
| Spacing          | px-4 py-8, grid gap-6, card-body space-y-5, table px-4 py-3           |
| Hover state      | shared btn-primary and btn-secondary hover states                     |
| Shadow           | shadow-sm through shared card class                                   |
| Accent usage     | red live-provider badge, yellow warning panel, green tick panel       |

**Pattern notes:**
Live automation test tools use a two-column desktop layout with a compact control form on the left and live status/output panels on the right. Keep destructive or provider-backed actions protected by confirmation copy, explicit consent checkboxes, and red/yellow caution states; action history should stay table-based with small status pills and compact icon+text controls. The selectable live-test channels are email, SMS, and voice call; meeting reminders are post-booking SMS actions triggered by Calendly confirmation, not pre-booking email reminder toggles. Per-action controls such as Skip should use the shared secondary button style inside the action table.

### Bob Voice Call Controls

File: frontend/pages/admin-dashboard.js
Last updated: 2026-06-18

| Property         | Class                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Background       | bg-white, bg-gray-50                                                  |
| Border           | border border-gray-200, border-b border-gray-200                      |
| Border radius    | rounded-lg for panels, rounded-md for controls and message items      |
| Text — primary   | text-gray-900                                                         |
| Text — secondary | text-gray-500, text-gray-600, text-gray-700                           |
| Spacing          | p-5, px-6 py-4, gap-2, gap-3, gap-4, space-y-2, space-y-3             |
| Hover state      | hover:bg-gray-50, hover:bg-slate-800, hover:bg-cyan-800               |
| Shadow           | shadow on dashboard panels, shadow-lg on modals                       |
| Accent usage     | slate primary actions, cyan voice action, green/red/indigo status pills |

**Pattern notes:**
Bob dashboard controls use the existing admin dashboard card/table language: white cards, gray table heads, compact status pills, and icon+text actions. Primary manual workflow actions stay slate, voice execution uses cyan, and transcript/outcome modals reuse gray/white framed sections with restrained borders.
