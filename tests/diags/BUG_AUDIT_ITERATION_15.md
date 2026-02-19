# Bug Audit — Iteration 15 of 30

**Scope:** Chat.jsx, Sheet.jsx, Editor.jsx (& EditorPane.jsx), Kanban.jsx, JoinWithLink.jsx  
**Date:** 2026-02-19

---

## Bug 1 — Chat messages not sorted by timestamp across peers

| Field | Value |
|-------|-------|
| **Severity** | 🔴 MEDIUM |
| **File** | `frontend/src/components/Chat.jsx` |
| **Lines** | 686–694 (updateFromYjs), 1237–1247 (groupedMessages) |
| **Symptom** | Messages from different peers can appear out of chronological order |

**Root cause:** The Yjs array `chat-messages` is deduplicated by ID but never sorted by timestamp. Yjs `Y.Array` merge order across peers is determined by CRDT semantics (client-ID + sequence number), not by the `timestamp` field inside each element. When two peers push messages concurrently, the merged array may interleave them in non-chronological order. The `groupedMessages` memo groups by date but preserves array order within each group.

A secondary effect is that the `showFullAuthor` logic (line ~1639) compares adjacent message timestamps — out-of-order messages produce negative deltas that are always `< 60000`, incorrectly collapsing author headers between temporally distant messages.

**Fix:** Sort messages by timestamp after deduplication:

```jsx
// In updateFromYjs, after deduplication (line ~693):
const deduped = msgs.filter(m => { ... });
deduped.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
setMessages(deduped);
```

---

## Bug 2 — Auto-open DM effect re-triggers on every chatTabs change

| Field | Value |
|-------|-------|
| **Severity** | 🟡 LOW |
| **File** | `frontend/src/components/Chat.jsx` |
| **Lines** | 831–876 |
| **Symptom** | All messages are re-scanned on every tab open/close, group sync, etc. |

**Root cause:** The auto-open DM effect at line 831 includes `chatTabs` in its dependency array:
```jsx
}, [messages, userPublicKey, chatTabs, onlineUsers, workspaceMembers, workspaceId]);
```
The effect *reads* `chatTabs` to check for existing tabs (line 854: `if (!chatTabs.find(...))`), AND *writes* to it via `setChatTabs`. Every tab addition triggers a re-run that loops over ALL messages. The functional-update guard inside `setChatTabs` prevents infinite loops, but the O(messages × tabs) work is wasted.

Additionally, `onlineUsers` changes every 30 seconds from the awareness heartbeat, causing another full re-scan.

**Fix:** Replace the outer `chatTabs.find()` guard with a ref-based check (the ref `chatTabsRef` already exists at line 773) and remove `chatTabs` from the dependency array. The inner `setChatTabs(prev => ...)` guard is sufficient for correctness:

```jsx
// Line 854: replace chatTabs.find with chatTabsRef.current.find
if (!chatTabsRef.current.find(t => t.id === tabId)) {
```
```jsx
// Line 876: remove chatTabs from deps
}, [messages, userPublicKey, onlineUsers, workspaceMembers, workspaceId, getDmChannelId]);
```

---

## Bug 3 — Kanban column rename allows duplicate names

| Field | Value |
|-------|-------|
| **Severity** | 🟡 LOW-MEDIUM |
| **File** | `frontend/src/components/Kanban.jsx` |
| **Lines** | 260–267 (`updateColumnName`) |
| **Symptom** | Two columns can end up with the same name after a rename, unlike `addColumn` which guards against this |

**Root cause:** `addColumn` (line 237) checks:
```jsx
if (base.some(c => c.name.toLowerCase() === newColumnName.trim().toLowerCase())) return;
```
But `updateColumnName` has no such check — it blindly writes the new name. If a user renames "In Progress" to "Done" while a "Done" column already exists, both columns will be named "Done". While IDs are unique, duplicate names confuse users and break any name-based references.

**Fix:** Add a collision check to `updateColumnName`:

```jsx
const updateColumnName = useCallback((columnId, name) => {
    if (!name.trim()) return; // Also guard empty names
    const currentColumns = ykanbanRef.current?.get('columns');
    const base = currentColumns ? JSON.parse(JSON.stringify(currentColumns)) : columns;
    // Reject if another column already has this name (case-insensitive)
    if (base.some(c => c.id !== columnId && c.name.toLowerCase() === name.trim().toLowerCase())) return;
    const newColumns = base.map(c =>
        c.id === columnId ? { ...c, name: name.trim() } : c
    );
    setColumns(newColumns);
    saveToYjs(newColumns, columnId);
    setEditingColumn(null);
}, [columns, saveToYjs]);
```

---

## Bug 4 — Sheet pendingOps can be lost when changes are batched in Yjs sync

| Field | Value |
|-------|-------|
| **Severity** | 🟡 LOW |
| **File** | `frontend/src/components/Sheet.jsx` |
| **Lines** | 400–417 (observer clears ops), 729–740 (handleOp pushes ops) |
| **Symptom** | Occasional brief desync — remote peer misses real-time ops and must wait for the 300ms debounced full save |

**Root cause:** `handleOp` sets `pendingOps = [...existing, newOp]` inside a transaction. After the transaction, the deep-observer fires and clears `pendingOps = []`. Both mutations happen in the same JS tick and may be batched into a single Yjs sync update. When the remote peer receives the update, it sees only the final value (`[]`), missing the intermediate state that contained the ops.

The full data save (300ms debounced `debouncedSaveToYjs`) eventually catches up, so data is not permanently lost. But the real-time op path is unreliable — users may see a brief flicker where a remote edit appears only after 300ms rather than immediately.

**Fix:** Do NOT clear `pendingOps` inside the observer. Instead, use a per-client "processed ops cursor" (a version counter or client-specific processed-up-to marker) so ops persist in Yjs until all peers have consumed them. Alternatively, accept the 300ms latency and remove the `pendingOps` mechanism entirely, relying solely on the full-data sync path.

A simpler interim fix: move the clearing of pendingOps *out* of the observer and into a separate `setTimeout(0)` so it's in a distinct Yjs transaction that syncs as a separate update:

```jsx
// Inside updateFromYjs, after applying remote ops (line ~415):
// Clear applied ops in a separate microtask → separate Yjs update
setTimeout(() => {
    if (ysheetRef.current) {
        ydoc.transact(() => {
            ysheetRef.current.set('pendingOps', []);
        });
    }
}, 0);
```

---

## Bug 5 — Kanban column name input: onBlur fires after Escape causing stale save

| Field | Value |
|-------|-------|
| **Severity** | 🟡 LOW-MEDIUM |
| **File** | `frontend/src/components/Kanban.jsx` |
| **Lines** | 575–590 (column header inline edit) |
| **Symptom** | Pressing Escape to cancel a column rename still saves the name because `onBlur` fires after `onKeyDown` |

**Root cause:** The inline column name edit input has:
```jsx
onBlur={(e) => {
    if (!e.target.dataset.cancelled) {
        updateColumnName(column.id, e.target.value);
    }
}}
onKeyDown={(e) => {
    if (e.key === 'Escape') {
        e.target.dataset.cancelled = 'true';
        setEditingColumn(null);
    }
}}
```
Setting `editingColumn` to `null` removes the input from the DOM. In React, `setEditingColumn(null)` triggers a re-render that unmounts the input. Depending on the browser, the `blur` event may fire *before* the DOM removal but *after* the dataset attribute is set. The `dataset.cancelled` check should prevent the save.

However, in some browsers (notably Firefox), `onBlur` can fire *before* `onKeyDown` completes setting the dataset when focus moves rapidly (e.g., Escape followed by immediate focus-away). Additionally, if `setEditingColumn(null)` causes a synchronous re-render that unmounts the element before `onBlur` fires, the blur handler runs on a stale element.

**Fix:** Use a ref to track cancellation state rather than a DOM dataset:

```jsx
// Add ref at component level:
const editCancelledRef = useRef(false);

// In onKeyDown for Escape:
editCancelledRef.current = true;
setEditingColumn(null);

// In onBlur:
onBlur={(e) => {
    if (!editCancelledRef.current) {
        updateColumnName(column.id, e.target.value);
    }
    editCancelledRef.current = false;
}}
```

---

## Bug 6 — Chat unread count inflated for channels with no lastRead entry

| Field | Value |
|-------|-------|
| **Severity** | 🟡 LOW |
| **File** | `frontend/src/components/Chat.jsx` |
| **Lines** | 1022–1038 (`unreadByChannel` memo) |
| **Symptom** | A channel that has never been viewed shows ALL messages from other users as unread, even historical messages from before the user joined |

**Root cause:** The unread computation uses:
```jsx
const lastRead = unreadCounts[ch]?.lastRead || 0;
```
When a channel has no entry in `unreadCounts` (never viewed), `lastRead` defaults to `0` (epoch). Every message with `timestamp > 0` from other users counts as unread. For channels with a long history, the badge can show hundreds of "unread" messages the user has never seen.

The auto-open DM effect (line 872) explicitly does NOT clear the unread count ("Don't clear unread count here — let the user see the unread badge"), which is intentional for new incoming DMs. But for group channels synced from Yjs (`syncGroupTabs` at line 798), all historical messages count as unread.

**Fix:** When a group tab is first added from `syncGroupTabs`, initialize its `lastRead` to `Date.now()` so only future messages are marked unread:

```jsx
// In syncGroupTabs, when adding a new group tab (~line 815):
if (!existingGroupIds.includes(group.id)) {
    setChatTabs(prev => { ... });
    // Initialize lastRead so historical messages aren't counted as unread
    setUnreadCounts(prev => {
        if (prev[group.id]) return prev; // Already has an entry
        const updated = { ...prev, [group.id]: { lastRead: Date.now(), count: 0 } };
        saveUnreadCounts(workspaceId, updated, userPublicKey);
        return updated;
    });
}
```

---

## Summary

| # | Bug | Severity | Component |
|---|-----|----------|-----------|
| 1 | Messages not sorted by timestamp | 🔴 MEDIUM | Chat.jsx |
| 2 | Auto-open DM effect re-triggers on every tab change | 🟡 LOW | Chat.jsx |
| 3 | Column rename allows duplicate names | 🟡 LOW-MEDIUM | Kanban.jsx |
| 4 | Sheet pendingOps lost during batched sync | 🟡 LOW | Sheet.jsx |
| 5 | Escape-cancel column rename race with onBlur | 🟡 LOW-MEDIUM | Kanban.jsx |
| 6 | Unread count inflated for channels without lastRead | 🟡 LOW | Chat.jsx |

### Components with no bugs found

- **Editor.jsx** — The `useEditor` hook doesn't rebind on `ydoc`/`provider` changes, but the parent (`AppNew.jsx` line 2120) uses `key={activeDocId}` which forces a full remount on document switch. No functional bugs found.

- **JoinWithLink.jsx** (the actual join workspace component at `frontend/src/components/common/JoinWithLink.jsx`) — Clean implementation. State resets on open, link validation is synchronous regex (no debounce needed), clipboard errors are caught, keyboard/backdrop dismissal works correctly. No functional bugs found.
