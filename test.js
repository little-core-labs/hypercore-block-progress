const replicate = require('hypercore-replicate')
const hypercore = require('hypercore')
const pump = require('pump')
const test = require('tape')
const ram = require('random-access-memory')
const fs = require('fs')

const capture = require('./')

test('progress = capture(feed[,opts])', (t) => {
  const source = hypercore(ram)
  source.ready(() => {
    const destination = hypercore(ram, source.key)
    const progress = capture(destination)
    source.append(Buffer.from('hello'), (err) => {
      replicate(source, destination, () => {
        t.equal(source.length, destination.length)

        t.equal(progress.total, destination.length)
        t.equal(progress.downloaded, destination.length)
        t.equal(progress.missing, 0)
        t.equal(progress.ratio, 1)
        t.equal(progress.percent, 100)
        t.ok(progress.elapsed)
        t.equal(0, progress.eta)
        t.ok(progress.rate)
        t.ok(progress.stats)

        t.end()
      })
    })
  })
})

test('await capture(feed)', (t) => {
  // TODO
  t.end()
})

test('capture(feed, { onerror })', (t) => {
  // TODO
  t.end()
})

test('capture(feed, { onsync })', (t) => {
  // TODO
  t.end()
})

test('capture(feed, { onblock })', (t) => {
  // TODO
  t.end()
})
