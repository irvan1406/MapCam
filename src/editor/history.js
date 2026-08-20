const EDITOR_KEYS = [
  'displayData', 'editedFields', 'templateId', 'template', 'map', 'overlay',
  'texts', 'activityName', 'note', 'logoDataUrl', 'name',
];

function takeSnapshot(project) {
  return Object.fromEntries(EDITOR_KEYS.map((key) => [key, structuredClone(project[key])]));
}

function applySnapshot(project, snapshot) {
  for (const key of EDITOR_KEYS) project[key] = structuredClone(snapshot[key]);
  project.modifiedAt = new Date().toISOString();
  return project;
}

export class EditorHistory {
  constructor(project, maximum = 40) {
    this.maximum = maximum;
    this.past = [];
    this.present = takeSnapshot(project);
    this.future = [];
  }

  commit(project) {
    const next = takeSnapshot(project);
    if (JSON.stringify(next) === JSON.stringify(this.present)) return;
    this.past.push(this.present);
    if (this.past.length > this.maximum) this.past.shift();
    this.present = next;
    this.future = [];
  }

  undo(project) {
    if (!this.canUndo) return project;
    this.future.unshift(this.present);
    this.present = this.past.pop();
    return applySnapshot(project, this.present);
  }

  redo(project) {
    if (!this.canRedo) return project;
    this.past.push(this.present);
    this.present = this.future.shift();
    return applySnapshot(project, this.present);
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
