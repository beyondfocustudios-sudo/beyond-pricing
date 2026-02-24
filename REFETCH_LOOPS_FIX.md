# 🔄 Refetch Loops Fix Guide

**Problem**: Pages may refetch data continuously, causing:
- Infinite network requests
- CPU/memory waste
- Rate limiting issues
- Flickering UI

**Solution**: Implement proper fetch patterns with error handling

---

## Pattern 1: Basic Fetch Once on Mount

### ❌ WRONG (Will loop)
```typescript
const [data, setData] = useState([]);

const loadData = useCallback(async () => {
  const res = await sb.from("table").select("*");
  setData(res.data);
}, []); // This creates new function on each render!

useEffect(() => {
  loadData(); // Will refetch if loadData changes
}, [loadData]); // ❌ Infinite loop
```

### ✅ CORRECT (Fetch once)
```typescript
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<Error | null>(null);

useEffect(() => {
  (async () => {
    try {
      const { data, error } = await sb.from("table").select("*");
      if (error) throw error;
      setData(data || []);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  })();
}, []); // Empty array = fetch once

// Render
if (loading) return <Loader />;
if (error) return <ErrorState error={error.message} onRetry={/* implement reload */} />;
return <div>{/* render data */}</div>;
```

---

## Pattern 2: Manual Refetch with Button

### ✅ CORRECT (Refetch on demand)
```typescript
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

const loadData = async () => {
  setLoading(true);
  setError(null);
  try {
    const { data, error } = await sb.from("table").select("*");
    if (error) throw error;
    setData(data || []);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  loadData();
}, []); // Fetch once

return (
  <div>
    {error && (
      <div style={{ color: "red" }}>
        <p>Erro: {error}</p>
        <button onClick={loadData}>Tentar Novamente</button>
      </div>
    )}
    {loading && <p>Carregando...</p>}
    {/* ... render data ... */}
  </div>
);
```

---

## Pattern 3: With Auto-Save

### ✅ CORRECT (Debounced save)
```typescript
const [data, setData] = useState(initialData);
const [saving, setSaving] = useState(false);
const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// Debounced auto-save
useEffect(() => {
  if (!data.changed) return;

  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

  saveTimerRef.current = setTimeout(async () => {
    setSaving(true);
    try {
      await sb.from("table").update(data).eq("id", data.id);
      setData(prev => ({ ...prev, changed: false }));
    } catch (err) {
      console.error("Save failed:", err);
      // Show toast/error
    } finally {
      setSaving(false);
    }
  }, 1500); // Debounce 1.5s

  return () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  };
}, [data]); // Trigger on data change
```

---

## Files to Fix (Priority Order)

### HIGH PRIORITY (Core CRUD)

#### 1. `/app/app/projects/page.tsx`
**Issue**: May refetch projects list continuously
**Current pattern**: Check if using `loadProjects` in effect deps
**Fix**:
```typescript
// Move fetch inside useEffect, not as separate function
useEffect(() => {
  const loadProjects = async () => {
    // ...
  };
  loadProjects();
}, []); // Empty deps
```

#### 2. `/app/app/checklists/page.tsx`
**Issue**: Refetch loops on checklists list
**Fix**: Same as above

#### 3. `/app/app/templates/page.tsx`
**Issue**: Templates list refetching
**Fix**: Same as above

#### 4. `/app/app/clients/page.tsx`
**Issue**: Clients list, likely has permission checks looping
**Fix**:
```typescript
// Fetch role once
useEffect(() => {
  checkOrgRole(); // Fetch once
}, []);

// If no role, show error/bootstrap (don't loop)
if (!orgRole) return <BootstrapPrompt />;

// Then fetch clients
useEffect(() => {
  if (orgRole) loadClients(); // Only after role loaded
}, [orgRole]); // Trigger only when role changes
```

#### 5. `/app/app/journal/page.tsx`
**Issue**: Journal entries list refetching
**Fix**: Same pattern

#### 6. `/app/app/tasks/page.tsx` (if exists)
**Issue**: Tasks list
**Fix**: Same pattern

#### 7. `/app/app/crm/page.tsx`
**Issue**: CRM contacts/deals list
**Fix**: Same pattern

#### 8. `/app/app/callsheets/page.tsx`
**Issue**: Call sheets list
**Fix**: Same pattern

### MEDIUM PRIORITY (API routes)

#### 9. `/app/api/projects/route.ts`
**Check**: GET handler doesn't have pagination issues

#### 10. `/app/api/conversations/route.ts`
**Check**: Messages fetch doesn't loop on client side

#### 11. `/app/api/crm/route.ts` & `/app/api/crm/deals/route.ts`
**Check**: No infinite pagination

#### 12. `/app/api/tasks/route.ts`
**Check**: Task pagination working

#### 13. `/app/api/journal/route.ts`
**Check**: Journal entries pagination

---

## Error Handling Template

For every fetch, implement this pattern:

```typescript
interface PageState {
  data: T[];
  loading: boolean;
  error: string | null;
}

const [state, setState] = useState<PageState>({
  data: [],
  loading: true,
  error: null,
});

const loadData = async () => {
  setState(prev => ({ ...prev, loading: true, error: null }));
  try {
    const { data, error } = await sb.from("table").select("*");
    if (error) throw error;
    setState(prev => ({ ...prev, data: data || [] }));
  } catch (err) {
    setState(prev => ({
      ...prev,
      error: err instanceof Error ? err.message : "Unknown error",
    }));
  } finally {
    setState(prev => ({ ...prev, loading: false }));
  }
};

useEffect(() => {
  loadData();
}, []); // Fetch once

// Render
if (state.loading) return <Loader />;
if (state.error) {
  return (
    <ErrorBoundary>
      <p>Erro: {state.error}</p>
      <button onClick={loadData}>Tentar Novamente</button>
    </ErrorBoundary>
  );
}
if (state.data.length === 0) {
  return <EmptyState onRetry={loadData} />;
}
return <div>{/* render data */}</div>;
```

---

## Toast Integration

For user feedback:

```typescript
const toast = useToast();

const handleSave = async () => {
  try {
    const { error } = await sb.from("table").update(data).eq("id", id);
    if (error) throw error;
    toast.success("Guardado com sucesso!");
  } catch (err) {
    toast.error(`Erro: ${err instanceof Error ? err.message : "Unknown"}`);
  }
};
```

---

## Testing Refetch Loops

### In Browser DevTools:

1. **Network Tab**:
   - Go to page
   - Watch Network tab
   - Should see ONE initial fetch
   - ❌ If multiple identical requests → loop detected

2. **Console**:
   - Add `console.log("Fetching...");` at start of fetch
   - Should print once on mount
   - ❌ If printing continuously → loop

3. **React DevTools** (if installed):
   - Check component render count
   - Should be low after initial mount
   - ❌ If continuously increasing → loop

### Fix Verification:
```bash
1. Open page
2. Watch Network tab
3. Wait 5 seconds
4. Should see only 1 fetch request (not repeating)
5. ✅ If so, loop is fixed
```

---

## Common Mistakes to Avoid

1. **❌ Putting `loadData` in dependency array**
   ```typescript
   useEffect(() => { loadData(); }, [loadData]); // LOOP!
   ```

2. **❌ Not checking if data changed before refetching**
   ```typescript
   useEffect(() => { loadData(); }, [data]); // Loops!
   ```

3. **❌ Forgetting async/await error handling**
   ```typescript
   useEffect(() => {
     sb.from("table").select("*").then(...); // Missing error catch
   }, []);
   ```

4. **❌ Using state updater in dependency array**
   ```typescript
   useEffect(() => { loadData(); }, [setData]); // LOOP!
   ```

5. **❌ Recreating functions on every render**
   ```typescript
   const loadData = () => {...}; // Created every render
   useEffect(() => { loadData(); }, [loadData]); // LOOP!
   ```

---

## Validation Checklist

After fixes:

- [ ] All pages load data exactly once on mount
- [ ] Error states show with "Retry" button
- [ ] No repeated network requests in DevTools
- [ ] No console spam
- [ ] Pages feel responsive (not laggy)
- [ ] Diagnostics page shows all tables green
- [ ] CRUD operations work (create, edit, delete)
- [ ] Auto-save works without loops (if applicable)

---

**Status**: 🟡 Ready to apply these patterns to all pages
**Next**: Go through each file and apply correct pattern

