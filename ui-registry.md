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
