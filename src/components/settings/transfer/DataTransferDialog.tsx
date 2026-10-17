import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, FileArchive, FileText, LoaderCircle, X } from "lucide-react";
import { makeBackup, makeMarkdown, readTransferFiles, selectedData } from "../../../features/transfer/portableData";
import { importFingerprint, importWorkspaceData, loadExportSource, resumeWorkspaceImports } from "../../../features/transfer/workspaceTransfer";
import { saveExport } from "../../../features/transfer/saveExport";
import { offlineStore } from "../../../features/notes/offlineStore";
import { useWorkspacePreference } from "../../../features/settings/workspacePreferences";
import { type TransferSource, type TransferTarget, transferSize } from "../../../features/transfer/transferTypes";
import { NoteSelection } from "./NoteSelection";
import "../deleteOfflineProfile.css";
import "./dataTransfer.css";

export function DataTransferDialog({ target, returnToDeletion, onClose }: { target: TransferTarget; returnToDeletion: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const sequence = useRef(0);
  const [theme] = useWorkspacePreference("scribe-theme");
  const [reviewTime, setReviewTime] = useState(() => Date.now());
  const [format, setFormat] = useState<"backup" | "markdown">("backup");
  const [source, setSource] = useState<TransferSource | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState("all");
  const [drafts, setDrafts] = useState(true);
  const [trash, setTrash] = useState(target.mode === "import" || Boolean(target.noteIds));
  const [reminders, setReminders] = useState(target.mode === "export");
  const [emptyFolders, setEmptyFolders] = useState(target.mode === "import");
  const [allowCopies, setAllowCopies] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState("");
  const [ignored, setIgnored] = useState(0);
  const [pendingJobs, setPendingJobs] = useState(0);
  const [revision, setRevision] = useState(0);
  const [duplicate, setDuplicate] = useState<{ selection: string; exists: boolean } | null>(null);
  const exporting = target.mode === "export";
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, element = dialog.current;
    const operationSequence = sequence;
    element?.showModal(); closeButton.current?.focus();
    return () => { operationSequence.current++; element?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    if (exporting) void loadExportSource(target.id).then(data => { if (active) { setSource(data); setSelected(new Set(target.noteIds ? data.notes.filter(note => target.noteIds!.includes(note.id)).map(note => note.id) : data.notes.map(note => note.id))); } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not read saved notes."); });
    else void offlineStore.pendingImports(target.id).then(jobs => { if (active) setPendingJobs(jobs.length); }).catch(() => { if (active) setError("Could not open local import storage."); });
    return () => { active = false; };
  }, [target.id, target.noteIds, exporting, revision]);
  const eligible = useMemo(() => source?.notes.filter(note => (!note.isDraft || drafts || Boolean(note.deletedAt)) && (!note.deletedAt || trash) && (folder === "all" || (folder === "unfiled" ? !note.folderId : note.folderId === folder))) ?? [], [source, drafts, trash, folder]);
  const selection = useMemo(() => new Set(eligible.filter(note => selected.has(note.id)).map(note => note.id)), [eligible, selected]);
  const selectedSource = useMemo(() => {
    if (!source) return null;
    const scoped = { ...source, folders: source.folders.filter(item => folder === "all" || item.id === folder) };
    return selectedData(scoped, selection, !exporting || format === "backup" && reminders, (exporting ? format === "backup" : source.kind === "backup") && emptyFolders);
  }, [source, selection, exporting, format, reminders, emptyFolders, folder]);
  const selectionKey = useMemo(() => `${[...selection].sort().join(",")}|${selectedSource?.folders.map(item => item.id).join(",")}|${reminders}`, [selection, selectedSource, reminders]);
  useEffect(() => {
    if (exporting || !selectedSource) return;
    let active = true;
    void importFingerprint(selectedSource, reminders).then(fingerprint => offlineStore.importReceipt(target.id, fingerprint)).then(receipt => { if (active) setDuplicate({ selection: selectionKey, exists: Boolean(receipt) }); }).catch(() => { if (active) setError("Could not check import history. Retry after reopening this dialog."); });
    return () => { active = false; };
  }, [exporting, selectedSource, reminders, selectionKey, target.id]);
  const close = () => { if (!busy.current) onClose(); };
  const readFiles = async (files: File[]) => {
    if (busy.current || pendingJobs) return;
    const current = ++sequence.current;
    busy.current = true; setWorking(true); setError(""); setNotice(""); setResult(""); setSource(null); setDuplicate(null); setAllowCopies(false); setFolder("all");
    try {
      const parsed = await readTransferFiles(files);
      if (sequence.current !== current) return;
      setReviewTime(Date.now()); setSource(parsed.source); setSelected(new Set(parsed.source.notes.map(note => note.id))); setIgnored(parsed.ignored); setDrafts(true); setTrash(true); setReminders(false); setEmptyFolders(parsed.source.kind === "backup");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read that file. Try a Scribe backup or Markdown ZIP."); }
    finally { busy.current = false; setWorking(false); }
  };
  const resume = async () => {
    if (busy.current) return;
    busy.current = true; setWorking(true); setError("");
    try { await resumeWorkspaceImports(target.id); setPendingJobs(0); setResult("Your saved import is complete. The notes are now available in this workspace."); }
    catch { setError("The saved import could not finish. Check available device storage and retry. Existing notes and the original import file are unchanged."); }
    finally { busy.current = false; setWorking(false); }
  };
  const submit = async () => {
    if (busy.current || !selectedSource || !selectedSource.notes.length && !selectedSource.folders.length) return;
    busy.current = true; setWorking(true); setError(""); setNotice("");
    try {
      if (exporting) {
        const bytes = format === "backup" ? makeBackup(selectedSource) : makeMarkdown(selectedSource);
        const saved = await saveExport(target.id, bytes, format);
        if (saved === "cancelled") setNotice("Export cancelled. Nothing was saved.");
        else setResult(`${saved === "saved" ? "Export saved" : "Download started — check your downloads"}. ${selectedSource.notes.length} notes${format === "backup" ? ` and ${selectedSource.folders.length} folders` : ""} included (${transferSize(bytes.length)}).`);
      } else {
        const imported = await importWorkspaceData(target.id, selectedSource, reminders, allowCopies);
        setResult(`Imported ${imported.notes} notes and ${imported.folders} folders. ${imported.reminders ? `${imported.reminders} future reminders restored.` : "No reminders were activated."}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "Could not complete data transfer. Please try again.");
      if (!exporting) setPendingJobs((await offlineStore.pendingImports(target.id).catch(() => [])).length);
    } finally { busy.current = false; setWorking(false); }
  };
  const selectedReminders = selectedSource?.reminders.filter(reminder => reminder.dueAt && Date.parse(reminder.dueAt) > reviewTime).length ?? 0;
  const alreadyImported = duplicate?.selection === selectionKey && duplicate.exists;
  const checkingHistory = !exporting && selectedSource && duplicate?.selection !== selectionKey;
  const selectionLabel = selection.size ? `${selection.size} ${selection.size === 1 ? "note" : "notes"}` : `${selectedSource?.folders.length ?? 0} folders`;
  const canSubmit = Boolean(selectedSource && (selectedSource.notes.length || (format === "backup" || !exporting) && selectedSource.folders.length) && !working && !pendingJobs && !checkingHistory && (!alreadyImported || allowCopies));
  return <dialog ref={dialog} data-sync-editing="true" className={`offline-delete-dialog transfer-dialog ${theme === "light" ? "is-light" : ""}`} aria-labelledby="transfer-title" aria-describedby="transfer-description" onCancel={event => { event.preventDefault(); close(); }}>
    <header><span className="transfer-dialog-icon">{exporting ? <ArrowDownToLine size={21} /> : <ArrowUpFromLine size={21} />}</span><button ref={closeButton} className="offline-delete-close" type="button" aria-label="Close data transfer" disabled={working} onClick={close}><X size={18} /></button></header>
    <h2 id="transfer-title">{exporting ? "Take your notes with you" : "Bring your notes into Scribe"}</h2>
    <p id="transfer-description">{exporting ? "Choose a format and exactly what to include." : "Review a backup or Markdown files before adding them."} <span className="transfer-destination">{exporting ? "From" : "Into"} <strong>{target.displayName}</strong></span></p>
    {result ? <section className="transfer-success" role="status"><Check size={27} /><h3>{exporting ? "Your export is ready" : "Import complete"}</h3><p>{result}</p><p>{exporting ? "Keep this file somewhere safe. You can import it into another offline or online Scribe workspace later." : "Existing notes were kept. Imported notes use fresh IDs and belong to this workspace."}</p>{!target.localOnly && !exporting && <p>{target.cloudSync ? "The normal sync queue will upload these notes after you close this dialog, subject to the 2 MB cloud limit. Any notes that cannot sync stay saved locally." : "Cloud sync is off. These notes stay on this device unless you enable it."}</p>}<button type="button" className="transfer-link" onClick={() => { setResult(""); setError(""); if (!exporting) { setSource(null); setDuplicate(null); setAllowCopies(false); } }}>{exporting ? "Save another export" : "Import another file"}</button></section> : <>
      {exporting && <fieldset className="transfer-format-options" disabled={working}><legend>Choose your format</legend>
        <label className={`transfer-format ${format === "backup" ? "is-selected" : ""}`}><input type="radio" name="transfer-format" checked={format === "backup"} onChange={() => setFormat("backup")} /><FileArchive size={22} /><strong>Scribe backup <small>.scribe</small></strong><span>Best for restoring in Scribe</span><p>Keeps folders, formatting, dates, pins, Drafts, Trash and optional reminders.</p></label>
        <label className={`transfer-format ${format === "markdown" ? "is-selected" : ""}`}><input type="radio" name="transfer-format" checked={format === "markdown"} onChange={() => setFormat("markdown")} /><FileText size={22} /><strong>Markdown ZIP <small>.zip</small></strong><span>Best for other apps</span><p>Readable .md files grouped by folder. Pins, dates, note status and reminders are not restored.</p></label>
      </fieldset>}
      {!exporting && <div className="transfer-upload" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!working && !pendingJobs) void readFiles([...event.dataTransfer.files]); }}><FileArchive size={24} /><strong>{source?.name ?? "Choose a backup or Markdown files"}</strong><span>Scribe backup, Markdown ZIP, or .md files · up to 50 MB</span><button type="button" disabled={working || Boolean(pendingJobs)} onClick={() => fileInput.current?.click()}>{working ? "Reading files…" : source ? "Choose another file" : "Choose files"}</button><input ref={fileInput} type="file" accept=".scribe,.json,.zip,.md,.markdown" multiple hidden onChange={event => { if (event.target.files?.length) void readFiles([...event.target.files]); event.target.value = ""; }} /></div>}
      {source && <>
        <div className="transfer-content-heading"><h3>{exporting ? "What would you like to export?" : "Choose what to import"}</h3><label>Folder<select value={folder} disabled={working} onChange={event => setFolder(event.target.value)}><option value="all">All folders</option><option value="unfiled">Unfiled</option>{source.folders.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        <div className="transfer-options"><label><input type="checkbox" checked={drafts} disabled={working} onChange={event => setDrafts(event.target.checked)} />Include Drafts</label><label><input type="checkbox" checked={trash} disabled={working} onChange={event => setTrash(event.target.checked)} />Include Trash</label>{(exporting ? format === "backup" : source.kind === "backup") && <label><input type="checkbox" checked={emptyFolders} disabled={working} onChange={event => setEmptyFolders(event.target.checked)} />Include empty folders</label>}</div>
        <NoteSelection notes={eligible} folders={source.folders} selected={selected} onChange={setSelected} disabled={working} />
        {(exporting ? format === "backup" : source.kind === "backup") && source.reminders.length > 0 && <label className="transfer-reminders"><input type="checkbox" checked={reminders} disabled={working} onChange={event => setReminders(event.target.checked)} /><span><strong>{exporting ? "Include reminders" : "Restore future reminders"}</strong><small>{exporting ? "Save schedules for selected notes. Importing will ask before activating them." : `${selectedReminders} future reminders in your selection. Past reminders will not be activated.`}</small></span></label>}
        {source.captureDrafts ? <p className="transfer-helper">Quick Capture’s saved draft is included as a regular Draft when selected.</p> : null}
        {ignored > 0 && <p className="transfer-helper">Skipped {ignored} non-Markdown files in the ZIP.</p>}
        {!exporting && source.kind === "markdown" && <p className="transfer-helper">Markdown is imported as regular notes. Folder paths become new folders; Scribe-specific settings are not available in this format.</p>}
        {!exporting && <div className="transfer-info"><strong>Existing notes stay unchanged.</strong><p>Notes and folders get new IDs. Same-named folders stay separate; this adds data without merging or replacing your workspace.</p>{!target.localOnly && <p>{target.cloudSync ? "Cloud sync is on. Imported content will use the normal sync queue and your 2 MB cloud allowance. If the limit is reached, remaining content stays local." : "Cloud sync is off. Import stays local and does not enable it."}</p>}</div>}
        {alreadyImported && <label className="transfer-reminders transfer-repeat"><input type="checkbox" checked={allowCopies} disabled={working} onChange={event => setAllowCopies(event.target.checked)} /><span><strong>Import again as new copies</strong><small>This selection was already imported here. Only enable this if you want another set of copies.</small></span></label>}
        {exporting && <p className="transfer-helper">Exports contain readable note content, not account credentials or app settings. {target.localOnly ? "" : "Only data saved on this device is included. Sync first if you need changes from other devices."} Keep the file somewhere safe.</p>}
      </>}
      {exporting && !source && !error && <p className="offline-delete-loading" role="status"><LoaderCircle className="offline-delete-spinner" size={16} />Reading saved notes…</p>}
      {pendingJobs > 0 && <div className="transfer-info"><strong>A saved import needs to finish.</strong><p>Resume it before adding more files. No existing notes will be replaced.</p><button type="button" className="transfer-link" disabled={working} onClick={() => { void resume(); }}>Resume saved import</button></div>}
    </>}
    {error && <p className="offline-delete-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {exporting && !source && error && <button type="button" className="transfer-link" onClick={() => { setError(""); setRevision(value => value + 1); }}>Retry loading notes</button>}
    <footer><button type="button" className="offline-delete-cancel" onClick={close} disabled={working}>{returnToDeletion ? "Back to deletion" : result ? "Done" : "Cancel"}</button>{!result && <button type="button" className="transfer-primary" disabled={!canSubmit} onClick={() => { void submit(); }}>{working && <LoaderCircle size={15} className="offline-delete-spinner" />}{working ? "Please wait…" : checkingHistory ? "Checking import…" : exporting ? `Export ${selectionLabel}` : `Import ${selectionLabel}`}</button>}</footer>
  </dialog>;
}
