// DAG Execution Engine
// - Kahn's Algorithm for topological sorting
// - DFS cycle detection
// - Parallel I/O with Promise.allSettled + concurrency limit

import type { Node, Edge } from 'reactflow';

interface AdjacencyMap {
  [nodeId: string]: string[];
}

function buildAdjacency(nodes: Node[], edges: Edge[]): {
  adj: AdjacencyMap;
  inDegree: Map<string, number>;
} {
  const adj: AdjacencyMap = {};
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    adj[n.id] = [];
    inDegree.set(n.id, 0);
  }
  for (const e of edges) {
    if (adj[e.source]) {
      adj[e.source].push(e.target);
    }
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  }
  return { adj, inDegree };
}

// DFS-based cycle detection. Returns IDs of nodes in cycles.
export function detectCycles(nodes: Node[], edges: Edge[]): Set<string> {
  const { adj } = buildAdjacency(nodes, edges);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const cycleNodes = new Set<string>();

  for (const n of nodes) color.set(n.id, WHITE);

  function dfs(u: string, path: string[]): boolean {
    color.set(u, GRAY);
    path.push(u);
    for (const v of (adj[u] || [])) {
      if (color.get(v) === GRAY) {
        // Found cycle — mark all nodes in the cycle path
        const cycleStart = path.indexOf(v);
        for (let i = cycleStart; i < path.length; i++) {
          cycleNodes.add(path[i]);
        }
        return true;
      }
      if (color.get(v) === WHITE) {
        if (dfs(v, path)) return true;
      }
    }
    path.pop();
    color.set(u, BLACK);
    return false;
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE) {
      dfs(n.id, []);
    }
  }
  return cycleNodes;
}

// Kahn's algorithm: returns layers of node IDs that can run in parallel
export function topologicalLayers(
  nodes: Node[],
  edges: Edge[]
): string[][] {
  const { adj, inDegree } = buildAdjacency(nodes, edges);
  const layers: string[][] = [];
  let queue = nodes
    .map((n) => n.id)
    .filter((id) => (inDegree.get(id) || 0) === 0);
  let visited = 0;

  while (queue.length > 0) {
    layers.push([...queue]);
    const nextQueue: string[] = [];
    for (const u of queue) {
      visited++;
      for (const v of (adj[u] || [])) {
        const deg = (inDegree.get(v) || 1) - 1;
        inDegree.set(v, deg);
        if (deg === 0) nextQueue.push(v);
      }
    }
    queue = nextQueue;
  }

  if (visited !== nodes.length) {
    throw new Error('Graph contains a cycle — cannot sort topologically');
  }
  return layers;
}

// Get parent node IDs for a given node
export function getParentIds(nodeId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

// Parallel execution with concurrency limit
export async function executeLayerWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number = 5
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = task().then(
      (value) => { results.push({ status: 'fulfilled', value }); },
      (reason) => { results.push({ status: 'rejected', reason }); }
    ).then(() => { executing.delete(p); });

    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}
