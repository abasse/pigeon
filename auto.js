const assert = require('assert');
const diff = require('./diff');
const patch = require('./patch');
const reverse = require('./reverse');
const { _clone } = require('./helpers');

const meta = new WeakMap();
const _cid = _id();

class AutoPigeon {

  constructor() {
    meta.set(this, {
      history: [],
      stash: [],
    });
  }

  static from(data, cid=_cid) {
    let doc = new AutoPigeon();
    meta.get(doc).cid = cid;
    doc = AutoPigeon.change(doc, doc => Object.assign(doc, data));
    return doc;
  }

  static _forge(data, cid=_cid) {
    let doc = new AutoPigeon();
    meta.get(doc).cid = cid;
    Object.assign(doc, _clone(data));
    const changes = AutoPigeon.getChanges(doc, data);
    return doc;
  }

  static init() {
    return AutoPigeon.from({});
  }

  static clone(doc, historyLength=Infinity) {
    const clone = AutoPigeon._forge(doc);
    meta.get(clone).history = meta.get(doc).history.slice(-historyLength);
    return clone;
  }

  static getChanges(left, right) {
    const _diff = diff(left, right);
    const changes = {
      diff: _diff,
      cid: meta.get(left).cid,
      ts: Date.now(),
      seq: _seq(),
      gid: _id(),
    }
    return changes;
  }

  static rewindChanges(doc, ts, cid) {

    const { history } = meta.get(doc);

    while (true) {
      if (!history.length) break;
      const change = history[history.length - 1];
      if (change.ts > ts || (change.ts == ts && change.cid > cid)) {
        const c = meta.get(doc).history.pop();
        patch(doc, reverse(c.diff));
        meta.get(doc).stash.push(c);
        continue;
      }
      break;
    }
  }

  static fastForwardChanges(doc) {
    const { stash, history } = meta.get(doc);
    let change;
    while (change = stash.pop()) {
      patch(doc, change.diff);
      history.push(change);
    }
  }

  static applyChanges(doc, changes) {
    const newDoc = AutoPigeon.clone(doc);
    AutoPigeon.rewindChanges(newDoc, changes.ts, changes.cid);
    patch(newDoc, changes.diff);
    AutoPigeon.fastForwardChanges(newDoc);
    const history = meta.get(newDoc).history;
    let idx = history.length;
    while (idx > 0 && history[idx - 1].ts > changes.ts) idx--;
    history.splice(idx, 0, changes);
    return newDoc;
  }

  static change(doc, fn) {

    assert(doc instanceof AutoPigeon);
    assert(fn instanceof Function);

    const tmp = _clone(doc);
    fn(tmp);
    const changes = AutoPigeon.getChanges(doc, tmp);
    return AutoPigeon.applyChanges(doc, changes);
  }

  static getHistory(doc) {
    return meta.get(doc).history;
  }

  static merge(doc1, doc2) {
    let doc = AutoPigeon.from({});
    const history1 = AutoPigeon.getHistory(doc1);
    const history2 = AutoPigeon.getHistory(doc2);
    const changes = [];
    while (history1.length || history2.length) {
      if (!history2.length) {
        changes.push(history1.shift());

      } else if (!history1.length) {
        changes.push(history2.shift());

      } else if (history1[0].gid === history2[0].gid) {
        changes.push(history1.shift() && history2.shift());

      } else if (history1[0].ts < history2[0].ts) {
        changes.push(history1.shift());

      } else if (history1[0].ts == history2[0].ts) {

        if (history1[0].seq < history2[0].seq) {
          changes.push(history1.shift());
        } else {
          changes.push(history2.shift());
        }

      } else {
        changes.push(history2.shift());
      }
    }

    for (const c of changes) {
      doc = AutoPigeon.applyChanges(doc, c);
    }
    return doc;
  }

  static getMissingDeps(doc) {
    return false;
  }

  static load(str, historyLength=Infinity) {
    const { meta: _meta, data } = JSON.parse(str);
    _meta.history = _meta.history.slice(-historyLength);
    const doc = AutoPigeon.from(data);
    Object.assign(meta.get(doc), _meta);
    return doc;
  }

  static save(doc) {
    const { cid, ..._meta } = meta.get(doc);
    return JSON.stringify({
      meta: _meta,
      data: doc,
    });
  }
}

function _id() {
  return Math.random().toString(36).substring(2);
}

let seq = 0;
function _seq() {
  return seq++;
}

module.exports = AutoPigeon;
