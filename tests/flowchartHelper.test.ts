import { createFlowchart } from '../convex/helpers/flowchart';

describe('createFlowchart helper', () => {
  beforeAll(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.1); // deterministic groupId
  });

  afterAll(() => {
    (Math.random as jest.Mock).mockRestore();
  });

  it('creates horizontal flowchart for ≤4 steps', async () => {
    const res = await (createFlowchart as any).handler({}, {
      sessionId: 'sess' as any,
      steps: ['A', 'B', 'C'],
    });
    expect(res.objects.length).toBe(3 * 2 + 2); // 3 boxes, 3 texts, 2 arrows = 8
    expect(res).toMatchSnapshot();
  });

  it('creates circular flowchart when >4 steps', async () => {
    const steps = ['1','2','3','4','5'];
    const res = await (createFlowchart as any).handler({}, { sessionId: 'sess' as any, steps });
    expect(res.objects.length).toBe(steps.length * 2 + steps.length); // boxes+texts+arrows
    expect(res).toMatchSnapshot();
  });
}); 