const { inspect } = require('util')
const debug = require('debug')('hypercore-block-progress')

// util
const bind = (o, f, ...rest) => (...args) => f.call(o, ...args, ...rest)

/**
 * Error for usage of the `Progress` instance after it is
 * destroyed.
 * @private
 */
class PROGRESS_DESTROYED_ERR extends Error {
  constructor() {
    super('Progress has been destroyed. Capture has ended.')
  }
}

/**
 * The `Clock` class represents a container for the tracking and
 * management of timing used by the `Progress` class.
 * @private
*/
class Clock {

  /**
   * `Clock class constructor.
   * @private
   */
  constructor() {
    this.now = Date.now()
  }

  /**
   * Time in milliseconds that the clock was "started". This value
   * can be reset with `clock.reset()`.
   * @accessor
  */
  get started() {
    return this.now
  }

  /**
   * Time in milliseconds since the clock was "started". This value
   * is computed with `Date.now() - started`.
   * @accessor
   */
  get elapsed() {
    return Date.now() - this.started
  }

  /**
   * Resets the "started" time in milliseconds to `Date.now()`.
  */
  reset() {
    this.now = Date.now()
  }
}

/**
 * The `Stats` class represents a porcelain object for the various stats
 * collected by the `Progress` class.
 * @private
 */
class Stats {
  static properties() {
    return [
      'eta',
      'rate',
      'total',
      'ratio',
      'elapsed',
      'missing',
      'percent',
      'downloaded',
    ]
  }

  /**
   * `Stats` class constructor.
   * @private
   * @param {Progress} progress
  */
  constructor(progress) {
    for (const key in Stats.properties()) {
      Object.defineProperty(this, key, {
        get: () => progress[key]
      })
    }

    Object.seal(this)
    Object.freeze(this)
  }

  /**
   * Implements the `util.inspect.custom` symbol for custom
   * output when passing this instance to `console.log()`.
   */
  [inspect.custom]() {
    return this.toJSON()
  }

  /**
   * Returns a JSON representation of this instance.
   */
  toJSON() {
    const stats = this
    const json = {}
    return Stats.properties().reduce(reduce, json)

    function reduce(out, key) {
      return Object.assign(out, {[key]: stats[key]})
    }
  }
}

/**
 * The `Progress` class represents a container that holds
 * the current download progress state values for a Hypercore feed
 * and callback function handlers invoked when 'download' and
 * 'sync' events are emitted.
 * @private
 */
class Progress {

  /**
   * `Progress` class constructor.
   * @private
   * @param {Hypercore} feed
   * @param {?(Object)} opts
   * @param {?(Object)} opts.context
   * @param {?(Function)} opts.onsync
   * @param {?(Function)} opts.onerror
   * @param {?(Function)} opts.onblock
   */
  constructor(feed, opts) {
    if (!opts || 'object' !== typeof opts) {
      opts = {}
    }

    this.ctx = Object.assign({}, opts.context) // copy
    this.feed = feed
    this.clock = new Clock()
    this.lastBlock = null
    this.destroyed = false

    // use function inputs as "magic" getter functions
    // that are given scoped access to `this` object and
    // the "context" object
    for (const k in this.ctx) {
      if ('function' === typeof this.ctx[k]) {
        const getter = this.ctx[k].bind(this.ctx)
        Object.defineProperty(this.ctx, k, {
          get: () => getter(this, this.ctx)
        })
      }
    }

    // bind handlers
    this.onsync = bind(this, opts.onsync || this.onsync, this, this.ctx)
    this.onerror = bind(this, opts.onerror || this.onerror, this, this.ctx)
    this.onblock = bind(this, opts.onblock || this.onblock, this, this.ctx)

    this.feed.on('sync', this.onsync)
    this.feed.on('error', this.onerror)
    this.feed.on('download', this.onblock)
    this.feed.on('download', bind(this, this.ondownload))

    this.feed.ready(() => {
      if (0 === this.total || this.downloaded < this.toal) {
        this.feed.update(() => this.clock.reset())
      } else if (this.total === this.downloaded) {
        this.clock.reset()
      }
    })
  }

  /**
   * Implements the `util.inspect.custom` symbol for custom
   * output when passing this instance to `console.log()`.
   */
  [inspect.custom](depth, opts) {
    let indent = ''
    while (indent.length < opts.indentationLvl) { indent += ' ' }
    opts.indentationLvl++
    return 'Progress(\n' +
      `${indent}  total: ${opts.stylize(this.total, 'number')}\n` +
      `${indent}  downloaded: ${opts.stylize(this.downloaded, 'number')}\n` +
      `${indent}  missing: ${opts.stylize(this.missing, 'number')}\n` +
      `${indent}  ratio: ${opts.stylize(this.ratio, 'number')}\n` +
      `${indent}  percent: ${opts.stylize(this.percent + '%', 'string')}\n` +
      `${indent}  elapsed: ${opts.stylize((this.elapsed / 1000).toFixed(1) + 's', 'string')}\n` +
      `${indent}  eta: ${opts.stylize(((this.eta / 1000) || 0).toFixed(1) + 's', 'string')}\n` +
      `${indent}  rate: ${opts.stylize(Math.round(1000*this.rate), 'number')}\n` +
      `${indent}  hypercore: ${this.feed[inspect.custom](depth, opts)}\n` +
      `${indent})`
  }

  /**
   * Returns the total possible blocks in the feed.
   * @accessor
   */
  get total() {
    return this.feed.length
  }

  /**
   * Returns the number of blocks downloaded in the feed.
   * @accessor
   */
  get downloaded() {
    try { return this.feed.downloaded() }
    catch (err) { return 0 }
  }

  /**
   * Returns the number of missing blocks in the feed.
   * @accessor
   */
  get missing() {
    return this.total - this.downloaded
  }

  /**
   * Returns the downloaded blocks ratio between `0` and `1`.
   * @accessor
   */
  get ratio() {
    return (this.downloaded / this.total) || 0
  }

  /**
   * Returns the downloaded blocks percentage between `0` and `100`.
   * @accessor
   */
  get percent() {
    return Math.floor(100*this.ratio) || 0
  }

  /**
   * Returns the computed elapsed time in milliseconds since the first block
   * was downloaded.
   * @accessor
   */
  get elapsed() {
    return this.clock.elapsed
  }

  /**
   * Returns the computed estimated time of arrival in milliseconds
   * when the download should be complete.
   * @accessor
   */
  get eta() {
    if (100 === this.percent) {
      return 0
    } else {
      return this.elapsed * (this.total / this.downloaded - 1)
    }
  }

  /**
   * Returns the computed average block download rate.
   * @accessor
   */
  get rate() {
    return this.downloaded / this.elapsed
  }

  /**
   * Returns read-only `Stats` instance that proxies progress state
   * properties into a plain object container.
   * @accessor
  */
  get stats() {
    return new Stats(this)
  }

  /**
   * Abstract method to handle errors during the life time of the
   * download.
   * @abstract
   */
  onerror(err) {
    if (err) {
      debug('progress: error:', err.stack || err)
    }
  }

  /**
   * Abstract method to handle the 'sync' event emitted on the
   * feed. This method is called with the `Progress` instance and context
   * object in the first and second argument positions.
   * @abstract
   * @param {Progress} self
   * @param {Object} ctx
   */
  onsync(self, ctx) { }

  /**
   * Abstract method to handle the 'download' event emitted on the
   * feed. This method is called with the `Progress` instance and context
   * object in the fourth and fifth argument positions.
   * @abstract
   * @param {Number} index
   * @param {Buffer} data
   * @param {(?(Object)} peer
   * @param {Progress} self
   * @param {Object} ctx
   */
  onblock(index, data, peer, self, ctx) {
    void index, data, peer, self, ctx
  }

  /**
   * Updates state after a block has been downloaded.
   * @private
   */
  ondownload(index, data, peer) {
    data.index = index
    data.peer = peer
    this.lastBlock = data
  }

  /**
   * Implements a `then()` method handle for a `Promise` interface
   * making this class suitable for usage with the `await` keyword.
   * @protected
   * @param {?(Function)} resolve
   * @param {?(Function)} reject
   * @return {Promsie<Stats<Progress>>}
   */
  then(resolve, reject) {
    if ('function' !== typeof resolve) {
      resolve = () => Promise.resolve()
    }

    if ('function' !== typeof reject) {
      reject = (err) => void err
    }

    if (this.destroyed) {
      reject(new PROGRESS_DESTROYED_ERR())
      return Promise.reject(new PROGRESS_DESTROYED_ERR())
    }

    if (!this.total || this.downloaded < this.total) {
      return new Promise((yep, nope) => {
        this.feed.once('sync', () => {
          if (this.destroyed) {
            nope(new PROGRESS_DESTROYED_ERR())
            reject(new PROGRESS_DESTROYED_ERR())
            return
          }

          try { yep(resolve(new Stats(this))) }
          catch (err) {
            reject(err)
            nope(err)
          }
        })

        this.feed.once('error', nope)
        this.feed.once('error', reject)
      })
    }

    try {
      return Promise.resolve(resolve(new Stats(this)))
    } catch (err) {
      return Promise.reject(err)
    }
  }

  /**
   * Returns a JSON representation of this instance.
   */
  toJSON() {
    return this.stats.toJSON()
  }

  /**
   * Destroy the instance. Removes event listeners
   * and marks instances as **destroyed**.
   */
  destroy() {
    this.feed.removeListener('sync', this.onsync)
    this.feed.removeListener('error', this.onerror)
    this.feed.removeListener('download', this.onblock)
    this.destroyed = true
  }

  /**
   * Alias to `progress.destroy()`
   */
  close() {
    return this.destroy()
  }

  /**
   * Alias to `progress.close()`
   */
  cancel() {
    return this.close()
  }
}

/**
 * Accepts a Hypercore feed as input and captures the download
 * progression over time invoking various callback functions when
 * the feed syncs, downloads a block, or incurs an error.
 * @public
 * @param {Hypercore} feed
 * @param {?(Object)} opts
 * @param {?(Object)} opts.context
 * @param {?(Function)} opts.onsync
 * @param {?(Function)} opts.onerror
 * @param {?(Function)} opts.onblock
 * @return {Progress}
 */
function capture(feed, opts) {
  return new Progress(feed, opts)
}

module.exports = capture
