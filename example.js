const ProgressBar = require('progress')
const replicate = require('hypercore-replicate')
const hypercore = require('hypercore')
const pretty = require('pretty-bytes')
const pump = require('pump')
const ram = require('random-access-memory')
const fs = require('fs')

const capture = require('./')

const source = hypercore(ram)

source.ready(() => {
  pump(
    fs.createReadStream('package-lock.json', { highWaterMark: 8 }),
    source.createWriteStream(),
    async (err) => {
      err && console.error('error:', err.message)

      const destination = hypercore(ram, source.key)

      replicate(source, destination, (err) => {
        err && console.error('error:', err.message)
      })

      capture(destination, {
        context: {
          bar: new ProgressBar('downloading: :bytes | [:bar] :percent :downloaded/:total (:missing missing) :rate/bps :eta | last block was :lastBlockSize', {
            width: 20,
            total: source.length
          }),

          // dynamically scoped context accessor variables
          lastBlockSize: (progress) => pretty(progress.lastBlock && progress.lastBlock.length || 0),
          downloaded: (progress) => progress.downloaded,
          missing: (progress) => progress.missing,
          bytes: (progress) => pretty(progress.feed.byteLength),
        },

        onerror(err) {
          console.error('error:', err.message)
        },

        onblock(index, data, peer, progress, ctx) {
          ctx.bar.update(progress.ratio, ctx)
        },

        onsync(progress) {
          console.log('downloading: sync complete')
          console.log(progress.stats)
        }
      })
    })
})
