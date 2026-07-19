'use strict'

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const {
  assertReceipt,
  geometryExpression,
  milestoneImageDimensions,
} = require('./verify_pages_gallery_cdp.js')

function validReceipt() {
  const milestoneImages = Object.entries(milestoneImageDimensions).map(
    ([file, dimensions]) => ({
      src: `docs/assets/screenshots/${file}`,
      complete: true,
      naturalWidth: dimensions.width,
      naturalHeight: dimensions.height,
    })
  )
  return {
    documentClientWidth: 960,
    documentScrollWidth: 960,
    bodyClientWidth: 960,
    bodyScrollWidth: 960,
    imageCount: milestoneImages.length,
    figureCount: milestoneImages.length,
    galleryImageCount: milestoneImages.length,
    invalidGalleryCards: [],
    brokenImages: [],
    milestoneImages,
    overflow: [],
    outsideControls: [],
  }
}

describe('Pages gallery CDP verifier contracts', () => {
  it('tracks every current promoted milestone at its accepted dimensions', () => {
    assert.deepEqual(
      milestoneImageDimensions['material-repository-tools.png'],
      {
        width: 1440,
        height: 960,
      }
    )
    assert.deepEqual(
      milestoneImageDimensions['material-repository-tools-scroll.png'],
      { width: 960, height: 420 }
    )
    assert.deepEqual(milestoneImageDimensions['add-submodule-dialog.png'], {
      width: 1440,
      height: 960,
    })
    assert.ok(
      Object.hasOwn(milestoneImageDimensions, 'material-submodule-context.png')
    )
    for (const file of Object.keys(milestoneImageDimensions)) {
      assert.match(geometryExpression, new RegExp(file.replaceAll('.', '\\.')))
    }
  })

  it('accepts one exact, nonbroken image for every milestone', () => {
    assert.doesNotThrow(() => assertReceipt(validReceipt(), 'contract'))
  })

  it('fails closed when a promoted image has stale dimensions', () => {
    const receipt = validReceipt()
    const image = receipt.milestoneImages.find(value =>
      value.src.endsWith('add-submodule-dialog.png')
    )
    assert.ok(image)
    image.naturalWidth = 1500
    image.naturalHeight = 1032
    assert.throws(() => assertReceipt(receipt, 'contract'), /failed geometry/)
  })
})
