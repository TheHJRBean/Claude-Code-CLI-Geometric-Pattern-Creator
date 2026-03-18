import { describe, it, expect } from 'vitest'
import { computeNeighborSides } from './neighborSides'

describe('computeNeighborSides — uniform tilings', () => {
  it('square tiling [4,4,4,4]: all neighbors of a square are squares', () => {
    const vc = [4, 4, 4, 4]
    const configPos0 = 0
    for (let edge = 0; edge < 4; edge++) {
      const result = computeNeighborSides(configPos0, edge, 4, vc)
      expect(result.sides).toBe(4)
    }
  })

  it('hexagonal tiling [6,6,6]: all neighbors of a hexagon are hexagons', () => {
    const vc = [6, 6, 6]
    const configPos0 = 0
    for (let edge = 0; edge < 6; edge++) {
      const result = computeNeighborSides(configPos0, edge, 6, vc)
      expect(result.sides).toBe(6)
    }
  })

  it('triangular tiling [3,3,3,3,3,3]: all neighbors of a triangle are triangles', () => {
    const vc = [3, 3, 3, 3, 3, 3]
    const configPos0 = 0
    for (let edge = 0; edge < 3; edge++) {
      const result = computeNeighborSides(configPos0, edge, 3, vc)
      expect(result.sides).toBe(3)
    }
  })
})

describe('computeNeighborSides — 4.8.8 tiling', () => {
  const vc = [4, 8, 8]

  it('all 4 edges of a square neighbor octagons', () => {
    const configPos0 = 0 // square is at position 0 in [4,8,8]
    for (let edge = 0; edge < 4; edge++) {
      const result = computeNeighborSides(configPos0, edge, 4, vc)
      expect(result.sides).toBe(8)
    }
  })

  it('octagon at config pos 1: edges alternate octagon/square', () => {
    const configPos0 = 1 // first 8 in [4,8,8]
    const expected = [8, 4, 8, 4, 8, 4, 8, 4]
    for (let edge = 0; edge < 8; edge++) {
      const result = computeNeighborSides(configPos0, edge, 8, vc)
      expect(result.sides).toBe(expected[edge])
    }
  })

  it('octagon at config pos 2: edges alternate square/octagon', () => {
    const configPos0 = 2 // second 8 in [4,8,8]
    const expected = [4, 8, 4, 8, 4, 8, 4, 8]
    for (let edge = 0; edge < 8; edge++) {
      const result = computeNeighborSides(configPos0, edge, 8, vc)
      expect(result.sides).toBe(expected[edge])
    }
  })
})

describe('computeNeighborSides — 3.4.6.4 tiling', () => {
  const vc = [3, 4, 6, 4]

  it('triangle at pos 0: all edges neighbor squares', () => {
    const configPos0 = 0
    for (let edge = 0; edge < 3; edge++) {
      const result = computeNeighborSides(configPos0, edge, 3, vc)
      expect(result.sides).toBe(4)
    }
  })

  it('square at pos 1: edges alternate hexagon/triangle', () => {
    const configPos0 = 1
    const expected = [6, 3, 6, 3]
    for (let edge = 0; edge < 4; edge++) {
      const result = computeNeighborSides(configPos0, edge, 4, vc)
      expect(result.sides).toBe(expected[edge])
    }
  })

  it('hexagon at pos 2: all edges neighbor squares', () => {
    const configPos0 = 2
    for (let edge = 0; edge < 6; edge++) {
      const result = computeNeighborSides(configPos0, edge, 6, vc)
      expect(result.sides).toBe(4)
    }
  })
})

describe('computeNeighborSides — 3.6.3.6 tiling', () => {
  const vc = [3, 6, 3, 6]

  it('triangle at pos 0: all edges neighbor hexagons', () => {
    const configPos0 = 0
    for (let edge = 0; edge < 3; edge++) {
      const result = computeNeighborSides(configPos0, edge, 3, vc)
      expect(result.sides).toBe(6)
    }
  })

  it('hexagon at pos 1: all edges neighbor triangles', () => {
    // In the trihexagonal tiling, hexagons are surrounded entirely by triangles
    const configPos0 = 1
    for (let edge = 0; edge < 6; edge++) {
      const result = computeNeighborSides(configPos0, edge, 6, vc)
      expect(result.sides).toBe(3)
    }
  })
})

describe('computeNeighborSides — chiral 4.6.12 tiling', () => {
  const vc = [4, 6, 12]

  it('12-gon at pos 2: edges alternate square/hexagon', () => {
    const configPos0 = 2
    const expected = [4, 6, 4, 6, 4, 6, 4, 6, 4, 6, 4, 6]
    for (let edge = 0; edge < 12; edge++) {
      const result = computeNeighborSides(configPos0, edge, 12, vc)
      expect(result.sides).toBe(expected[edge])
    }
  })

  it('square at pos 0: edges alternate hexagon/12-gon', () => {
    const configPos0 = 0
    const expected = [6, 12, 6, 12]
    for (let edge = 0; edge < 4; edge++) {
      const result = computeNeighborSides(configPos0, edge, 4, vc)
      expect(result.sides).toBe(expected[edge])
    }
  })

  it('hexagon at pos 1: edges alternate 12-gon/square', () => {
    const configPos0 = 1
    const expected = [12, 4, 12, 4, 12, 4]
    for (let edge = 0; edge < 6; edge++) {
      const result = computeNeighborSides(configPos0, edge, 6, vc)
      expect(result.sides).toBe(expected[edge])
    }
  })
})

describe('computeNeighborSides — 3.12.12 tiling', () => {
  const vc = [3, 12, 12]

  it('triangle at pos 0: all edges neighbor 12-gons', () => {
    const configPos0 = 0
    for (let edge = 0; edge < 3; edge++) {
      const result = computeNeighborSides(configPos0, edge, 3, vc)
      expect(result.sides).toBe(12)
    }
  })

  it('12-gon at pos 1: edges alternate 12-gon/triangle', () => {
    const configPos0 = 1
    const expected = [12, 3, 12, 3, 12, 3, 12, 3, 12, 3, 12, 3]
    for (let edge = 0; edge < 12; edge++) {
      const result = computeNeighborSides(configPos0, edge, 12, vc)
      expect(result.sides).toBe(expected[edge])
    }
  })
})

describe('computeNeighborSides — neighborConfigPos is consistent', () => {
  it('neighbor configPos refers to the correct polygon type', () => {
    const vc = [4, 8, 8]
    const configPos0 = 1 // octagon
    for (let edge = 0; edge < 8; edge++) {
      const result = computeNeighborSides(configPos0, edge, 8, vc)
      // The returned configPos must index the correct type in vc
      expect(vc[result.configPos]).toBe(result.sides)
    }
  })

  it('4.8.8 square: neighbor config positions all point to octagon slots', () => {
    const vc = [4, 8, 8]
    const configPos0 = 0 // square
    for (let edge = 0; edge < 4; edge++) {
      const result = computeNeighborSides(configPos0, edge, 4, vc)
      expect(result.sides).toBe(8)
      expect(result.configPos === 1 || result.configPos === 2).toBe(true)
    }
  })
})
