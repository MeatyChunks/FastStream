import {BackgroundUtils} from './BackgroundUtils.mjs';

export class FrameHolder {
  constructor(tab, frameId) {
    this.tab = tab;
    this.frameId = frameId;
    this.parent = null;
    this.children = new Set();
    this.loadedCallbacks = new Set();
    this.reset();
  }

  reset() {
    this.playerOpening = false;
    this.isPlayer = false;
    this.trackedSubtitles = [];
    this.trackedSources = [];
    this.requestHeaders = new Map();
    this.url = '';
  }

  removeChildFrame(childFrame) {
    this.children.delete(childFrame);
    childFrame.parent = null;
  }

  addChildFrame(childFrame) {
    this.children.add(childFrame);
    childFrame.parent = this;
  }

  setParentFrame(parentFrame) {
    parentFrame.children.add(this);
    this.parent = parentFrame;
  }


  hasPlayer() {
    if (this.isPlayer) {
      return true;
    }

    for (const child of this.children) {
      if (child.isPlayer) {
        return true;
      }
    }

    return false;
  }

  getSubtitles() {
    return this.trackedSubtitles;
  }

  getSources() {
    return this.trackedSources;
  }


  resetSelfAndChildren() {
    let count = this.isPlayer ? 1 : 0;
    this.reset();
    this.children.forEach((child) => {
      count += child.resetSelfAndChildren();
      child.parent = null;
      this.tab.removeFrame(child.frameId);
    });
    this.children.clear();
    return count;
  }
}

export class TabHolder {
  constructor(tracker, tabId) {
    this.tracker = tracker;
    this.tabId = tabId;
    this.frames = new Map();

    this.isOn = false;
    this.url = '';

    this.reset();
  }
  reset() {
    this.frames.clear();
    this.playerCount = 0;
    this.continuationOptions = null;
    this.analyzerData = null;
  }
  getFrames() {
    return this.frames.values();
  }
  getFrame(frameId) {
    return this.frames.get(frameId);
  }
  getFrameOrCreate(frameId) {
    return this.getFrame(frameId) || this.createFrame(frameId);
  }
  createFrame(frameId) {
    const newFrame = new FrameHolder(this, frameId);
    this.frames.set(frameId, newFrame);
    return newFrame;
  }
  removeFrame(frameId) {
    this.frames.delete(frameId);
  }

  getMainPlayer() {
    if (!BackgroundUtils.isUrlPlayerUrl(this.url)) {
      return null;
    }

    const mainFrame = this.getFrame(0);
    if (!mainFrame) {
      return null;
    }

    return mainFrame.isPlayer ? mainFrame : null;
  }
}

export class TabTracker {
  constructor() {
    this.tabs = new Map();
    // Periodically clean up stale tabs that weren't caught by onRemoved
    // (e.g., if the extension was suspended and missed events)
    this._cleanupInterval = setInterval(() => this._cleanupStaleTabs(), 120000);
  }

  createTab(tabId) {
    const newTab = new TabHolder(this, tabId);
    this.tabs.set(tabId, newTab);
    return newTab;
  }

  getTab(tabId) {
    return this.tabs.get(tabId);
  }

  getTabOrCreate(tabId) {
    return this.getTab(tabId) || this.createTab(tabId);
  }

  removeTab(tabId) {
    this.tabs.delete(tabId);
  }

  _cleanupStaleTabs() {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    chrome.tabs.query({}, (activeTabs) => {
      if (chrome.runtime.lastError || !this.tabs) return;
      const activeIds = new Set(activeTabs.map(t => t.id));
      for (const [tabId] of this.tabs) {
        if (!activeIds.has(tabId)) {
          this.removeTab(tabId);
        }
      }
    });
  }

  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }

  size() {
    return this.tabs.size;
  }

  totalPlayerCount() {
    let count = 0;
    for (const tab of this.tabs.values()) {
      count += tab.playerCount;
    }
    return count;
  }

  getFrame(tabId, frameId) {
    const tab = this.getTab(tabId);
    return tab && tab.getFrame(frameId);
  }

  getFrameOrCreate(tabId, frameId) {
    const tab = this.getTabOrCreate(tabId);
    return tab.getFrameOrCreate(frameId);
  }
}
