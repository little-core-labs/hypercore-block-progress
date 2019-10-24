hypercore-block-progress
========================

> Track the block download progress of a [Hypercore][hypercore] feed.

## Installation

```sh
$ npm install hypercore-block-progress
```

## Status

> **Stable**

## Usage

```js
const capture = require('hypercore-block-progress')
const progress = capture(feed, {
  // called for every 'download' event on emitted on `feed`
  onblock(index, data, peer, progress, ctx) {
  },

  // called when 'sync' event is emitted on `feed`
  onsync(progress, ctx) {
  },

  // handle `err`
  onerror(err, progress, ctx) {
  },
})
```

## API

The following section details how to capture download progress
information for a [Hypercore][hypercore] feed in real time.

<a name="capture" /></a>
### `progress = capture(feed[, opts])`

Creates a `Progress` instance from `feed` and optional `opts` where
`feed` is a [Hypercore][hypercore] feed and `opts` is an optional options
object that can be:

```js
{
  // context is the last argument for the `onerror()`, `onsync()`, and
  // `onblock()` function handlers
  context: {
    // static and dynamic context properties
  },

  onerror(err, progress, ctx) {
    // handle errors emitted on the feed while progress is captured
  },

  onsync(progress, ctx) {
    // 'sync' event emitted on feed
  },

  onblock(index, data, peer, progress, ctx) {
    // called when a block is downloaded
  },
}
```

<a name="capture-example" /></a>
##### Example

```js
const capture = require('hypercore-block-progress')
const pretty = require('pretty-bytes')
const Bar = require('progress')

const progress = capture(feed, {
  context: {
    // static context property
    bar: new Bar('downloading :byteLength: [:bar] :percent'),
    // dynamic context property
    byteLength: (progress, ctx) => pretty(feed.byteLength),
  },

  onblock(index, data, peer, progress, ctx) {
    ctx.bar.update(progress.ratio, {
      byteLength: ctx.byteLength
    })
  },
})
```

<a name="await-capture" /></a>
### `await capture(feed[, opts])`

The `await` keyword can also be used on the returned instance to wait
for the download to complete or fail with [`stats`](#progress-stats)
returned to the awaited caller.

<a name="progress-total" /></a>
#### `progress.total`

The total number of blocks that can be downloaded in the feed.

<a name="progress-downloaded" /></a>
#### `progress.downloaded`

The total number of blocks downloaded in the feed.

<a name="progress-missing" /></a>
#### `progress.missing`

The total number of blocks not downloaded in the feed.

<a name="progress-ratio" /></a>
#### `progress.ratio`

The ratio between the total number of blocks that are downloaded and the
total number of blocks that can be downloaded.

<a name="progress-percent" /></a>
#### `progress.percent`

The integer percentage of the total number of blocks that are downloaded
compared to the total number of blocks that can be downloaded.

<a name="progress-elapsed" /></a>
#### `progress.elapsed`

The number of milliseconds since the first block was downloaded.

<a name="progress-eta" /></a>
#### `progress.eta`

The computed estimated time of arrival in milliseconds when the
downloaded should be complete.

<a name="progress-rate" /></a>
#### `progress.rate`

The computed average block download rate.

<a name="progress-stats" /></a>
#### `progress.stats`

Read-only, `JSON.stringify()`, safe plain object view of the statistics
captured while the feed is downloading.

A stats object may look soemthing like this:

```js
{ eta: 0,
  rate: 10.940782122905027,
  total: 9792,
  ratio: 1,
  elapsed: 895,
  missing: 0,
  percent: 100,
  downloaded: 9792 }
```

<a name="progress-destroy" /></a>
#### `progress.destroy()`

Destroys the instance, removing all attached event listeners, and
marking the instance as destroyed (`progress.destroyed = true`).

<a name="progress-onerror" /></a>
#### `progress.onerror(err, progress, ctx)`

Method handler called when an `'error'` event is emitted on `feed` during
the life time the download is captured. This can be overwritten by
supplying `opts.onerror` to the [`capture()`](#capture) function.

<a name="progress-onsync" /></a>
#### `progress.onsync(progress, ctx)`

Method handler called when a `'sync'` event is emitted on `feed` during
the life time the download is captured. This can be overwritten by
supplying `opts.onsync` to the [`capture()`](#capture) function.

<a name="progress-onblock" /></a>
#### `progress.onblock(index, data, peer, progress, ctx)`

Method handler called when a `'download'` event is emitted on `feed` during
the life time the download is captured. This can be overwritten by
supplying `opts.onblock` to the [`capture()`](#capture) function.

## License

MIT

[hypercore]: https://github.com/mafintosh/hypercore
