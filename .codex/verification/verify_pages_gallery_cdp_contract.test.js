'use strict'

const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const {
  acceptedImageDimensions,
  acceptedImageNames,
  assertReceipt,
  ExpectedGalleryImageCount,
  geometryExpression,
  readTrackedPngDimensions,
} = require('./verify_pages_gallery_cdp.js')

function validReceipt() {
  const acceptedImages = Object.entries(acceptedImageDimensions).map(
    ([file, dimensions]) => ({
      src: `docs/assets/screenshots/${file}`,
      file,
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
    imageCount: acceptedImages.length,
    figureCount: acceptedImages.length,
    galleryImageCount: acceptedImages.length,
    galleryAssetNames: acceptedImages.map(image => image.file),
    invalidGalleryCards: [],
    brokenImages: [],
    acceptedImages,
    overflow: [],
    outsideControls: [],
  }
}

describe('Pages gallery CDP verifier contracts', () => {
  it('tracks the exact guided gallery at its accepted dimensions', () => {
    assert.equal(ExpectedGalleryImageCount, 84)
    assert.equal(acceptedImageNames.length, 84)
    assert.equal(new Set(acceptedImageNames).size, 84)
    assert.equal(Object.keys(acceptedImageDimensions).length, 84)
    assert.equal(
      acceptedImageNames.includes('auto-updater-current-source-ready.png'),
      true
    )
    assert.equal(
      acceptedImageNames.includes('auto-updater-update-ready.png'),
      false
    )
    for (const historical of [
      'linux-tui-bilingual-narrow.png',
      'linux-tui-cheap-lfs.png',
      'linux-tui-overview.png',
      'linux-tui-regex-builder.png',
      'linux-tui-text-input.png',
    ]) {
      assert.equal(acceptedImageNames.includes(historical), false, historical)
    }
    assert.deepEqual(acceptedImageDimensions['material-repository-tools.png'], {
      width: 1440,
      height: 960,
    })
    assert.deepEqual(
      acceptedImageDimensions['material-repository-tools-scroll.png'],
      { width: 1000, height: 679 }
    )
    assert.deepEqual(acceptedImageDimensions['add-submodule-dialog.png'], {
      width: 1440,
      height: 960,
    })
    assert.deepEqual(
      acceptedImageDimensions['material-responsive-overflow-fixed.png'],
      { width: 1450, height: 997 }
    )
    assert.deepEqual(
      acceptedImageDimensions['repository-list-sync-summary.png'],
      { width: 390, height: 100 }
    )
    assert.deepEqual(
      acceptedImageDimensions['material-ollama-model-manager.png'],
      { width: 1452, height: 1001 }
    )
    for (const file of acceptedImageNames) {
      assert.deepEqual(
        acceptedImageDimensions[file],
        readTrackedPngDimensions(file)
      )
      assert.match(geometryExpression, new RegExp(file.replaceAll('.', '\\.')))
    }
  })

  it('accepts one exact, nonbroken image for every milestone', () => {
    assert.doesNotThrow(() => assertReceipt(validReceipt(), 'contract'))
  })

  it('fails closed when a promoted image has stale dimensions', () => {
    const receipt = validReceipt()
    const image = receipt.acceptedImages.find(value =>
      value.src.endsWith('add-submodule-dialog.png')
    )
    assert.ok(image)
    image.naturalWidth = 1500
    image.naturalHeight = 1032
    assert.throws(() => assertReceipt(receipt, 'contract'), /failed geometry/)
  })

  it('fails closed when a gallery asset is missing or duplicated', () => {
    const missing = validReceipt()
    missing.galleryAssetNames.pop()
    missing.acceptedImages.pop()
    missing.galleryImageCount -= 1
    missing.figureCount -= 1
    assert.throws(() => assertReceipt(missing, 'contract'), /failed geometry/)

    const duplicate = validReceipt()
    duplicate.galleryAssetNames[1] = duplicate.galleryAssetNames[0]
    duplicate.acceptedImages[1] = { ...duplicate.acceptedImages[0] }
    assert.throws(() => assertReceipt(duplicate, 'contract'), /failed geometry/)
  })
})
