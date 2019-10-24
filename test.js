const replicate = require('hypercore-replicate')
const hypercore = require('hypercore')
const pump = require('pump')
const test = require('tape')
const util = require('util')
const ram = require('random-access-memory')
const fs = require('fs')

const xtest = () => void 0
const capture = require('./')

test('progress = capture(feed[,opts])', (t) => {
  const source = hypercore(ram)
  source.ready(() => {
    const destination = hypercore(ram, source.key)
    const progress = capture(destination)

    t.equal(0, progress.downloaded)
    t.equal(0, progress.eta)

    source.append(Buffer.from('hello'), (err) => {
      replicate(source, destination, () => {
        t.equal(source.length, destination.length)

        t.equal(progress.total, destination.length)
        t.equal(progress.downloaded, destination.length)
        t.equal(progress.missing, 0)
        t.equal(progress.ratio, 1)
        t.equal(progress.percent, 100)
        t.equal(0, progress.eta)
        t.ok(progress.rate)
        t.ok(progress.stats)
        t.ok(progress.elapsed)

        source.close()
        destination.close()
        progress.destroy()
        t.equal(true, progress.destroyed)
        t.end()
      })
    })
  })
})

test('capture(feed[,opts]) - stats', (t) => {
  const source = hypercore(ram)
  source.ready(() => {
    const destination = hypercore(ram, source.key)
    const progress = capture(destination)
    source.append(Buffer.from('hello'), (err) => {
      replicate(source, destination, () => {
        const { stats } = progress
        const json = progress.toJSON()

        t.ok('function' === typeof stats.constructor.properties)
        t.ok(Array.isArray(stats.constructor.properties()))

        t.equal(progress.eta, stats.eta)
        t.equal(progress.rate, stats.rate)
        t.equal(progress.total, stats.total)
        t.equal(progress.ratio, stats.ratio)
        t.equal(progress.elapsed, stats.elapsed)
        t.equal(progress.missing, stats.missing)
        t.equal(progress.percent, stats.percent)
        t.equal(progress.downloaded, stats.downloaded)

        t.equal(json.eta, stats.eta)
        t.equal(json.total, stats.total)
        t.equal(json.ratio, stats.ratio)
        t.equal(json.missing, stats.missing)
        t.equal(json.percent, stats.percent)
        t.equal(json.downloaded, stats.downloaded)

        t.ok(util.inspect.custom in progress.stats)
        t.ok('function' === typeof progress.stats[util.inspect.custom])
        t.ok('object' === typeof progress.stats[util.inspect.custom]())

        source.close()
        destination.close()
        progress.destroy()
        t.end()
      })
    })
  })
})

test('capture(feed[,opts]) - cancel', (t) => {
  const source = hypercore(ram)
  source.ready(() => {
    const destination = hypercore(ram, source.key)
    const progress = capture(destination)
    source.append(Buffer.from('hello'), (err) => {
      replicate(source, destination, () => {
        source.close()
        destination.close()
      })

      progress.cancel()
      t.equal(true, progress.destroyed)
      t.equal(true, progress.cancelled)
      t.end()
    })
  })
})

test('await capture(feed)', (t) => {
  const source = hypercore(ram)
  source.ready(() => {
    const destination = hypercore(ram, source.key)
    const destination2 = hypercore(ram, source.key)
    const destination3 = hypercore(ram, source.key)
    const destination4 = hypercore(ram, source.key)
    const destination5 = hypercore(ram, source.key)
    const destination6 = hypercore(ram, source.key)

    source.append(Buffer.from('hello'), async (err) => {
      replicate(source, destination)

      t.ok(await capture(destination))

      t.ok(capture(destination).then() instanceof Promise)

      capture(destination).then(() => {
        throw new Error()
      }).catch((err) => {
        t.ok(err)
        capture(destination2).catch((err) => {
          t.ok(err)
        })

        destination2.emit('error', new Error())

        capture(destination3)
          .then(() => { throw new Error() })
          .catch((err) => {
            t.ok(err)
            throw err
          }).catch((err) => {
            t.ok(err)
          })

        replicate(source, destination2)
        replicate(source, destination3)

        const p4 = capture(destination4)

        p4.catch((err) => {
          t.ok(err)
        })

        replicate(source, destination4)
        p4.cancel()

        const p5 = capture(destination5)
        p5.cancel()

        p5.catch((err) => {
          t.ok(err)
        })

        const p6 = capture(destination6)
        p6.close()

        p6.then((v) => t.notOk(v), (err) => {
          t.ok(err)
          t.end()
        })
      })
    })
  })
})

test('capture(feed, { onerror })', (t) => {
  const source = hypercore(ram)
  source.ready(() => {
    const p = capture(source, {
      onerror(err, progress, ctx) {
        t.ok('oops' === err.message)
        t.ok(p === progress)
        t.ok(ctx === progress.ctx)
        p.close()
        t.end()
      }
    })

    source.emit('error', new Error('oops'))
  })
})

test('capture(feed, { onsync })', (t) => {
  const source = hypercore(ram)
  source.ready(() => {
    const destination = hypercore(ram, source.key)
    const progress = capture(destination, {
      onsync(self, ctx) {
        t.ok(progress === self)
        t.ok(progress.ctx === ctx)
        t.end()
      }
    })

    source.append(Buffer.from('hello'), (err) => {
      replicate(source, destination)
    })
  })
})

test('capture(feed, { onblock })', (t) => {
  const source = hypercore(ram)
  source.ready(() => {
    let blocks = 0
    const destination = hypercore(ram, source.key)
    const progress = capture(destination, {
      onsync(self, ctx) {
        t.ok(progress === self)
        t.ok(progress.ctx === ctx)
        t.ok(blocks === destination.length)
        t.end()
      },

      onblock(index, data, peer, self, ctx) {
        blocks++
        t.ok('number' === typeof index)
        t.ok(Buffer.isBuffer(data))
        t.ok(peer)
        t.ok(progress === self)
        t.ok(progress.ctx === ctx)
        t.ok(progress.eta >= 0 && !Number.isNaN(progress.eta))
      },
    })

    replicate(source, destination, { live: true })
    source.append(Buffer.from('hello'))
    source.append(Buffer.from('world'))
    source.append(Buffer.from('goodbye'))
    source.append(Buffer.from('moon'))
  })
})

test('capture(feed, { context: { ... } })', (t) => {
  const source = hypercore(ram)
  source.ready(() => {
    const destination = hypercore(ram, source.key)
    const progress = capture(destination, {
      context: {
        static: 'value',
        dynamic(self, ctx) {
          t.ok(progress === self)
          t.ok(progress.ctx === ctx)
          return destination.key
        },
      },

      onsync(self, ctx) {
        t.ok('value' === ctx.static)
        t.ok(0 === Buffer.compare(ctx.dynamic, destination.key))
        t.end()
      }
    })

    source.append(Buffer.from('hello'), () => {
      replicate(source, destination)
    })
  })
})

test('capture(feed[, opts]) - [util.inspect.custom]()', (t) => {
  const source = hypercore(ram)
  const util = require('util')

  const progress = capture(source)

  t.ok(util.inspect.custom in progress)
  t.ok('function' === typeof progress[util.inspect.custom])
  t.ok('string' === typeof progress[util.inspect.custom]())
  t.end()
})
