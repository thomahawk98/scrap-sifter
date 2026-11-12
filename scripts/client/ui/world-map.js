import { getViewBasis } from '../shared/view-basis.js';
import WorldMapScale from './world-map-scale.js';

const GRID_DIVISIONS = 3;
const CLOSED_PANEL_SIZE = 210;
const OPEN_PANEL_SIZE = 430;
const MAP_CUBE_PIXEL_SPAN = 136;
const MAP_UP = normalize([1, 1, 1]);
const MAP_RIGHT = normalize([1, -1, 0]);
const MAP_DEPTH = normalize(cross(MAP_RIGHT, MAP_UP));

// Draw the loaded world as a rotatable, zoomable orthographic HUD view.
export default class WorldMap {
    // Initialize map controls and listen for panel rotation and scale gestures.
    constructor(canvas) {
        this.canvas = canvas;
        this.open = false;
        this.yaw = 0;
        this.pitch = 0;
        this.roll = 0;
        this.zoom = 1;
        this.returning = false;
        this.rotationActive = true;
        this.dragging = false;
        this.lastPointer = null;
        this.lastUpdate = null;
        this.panelX = null;
        this.panelY = null;
        this.panelSize = null;
        this.mapScale = new WorldMapScale();
        document.addEventListener('mousedown', event => this.beginDrag(event), true);
        document.addEventListener('mousemove', event => this.drag(event));
        document.addEventListener('mouseup', () => { this.dragging = false; });
        document.addEventListener('wheel', event => this.scale(event), { passive: false });
    }

    // Ease the panel and cube back together only while the map is closing.
    update(timestamp) {
        if (this.lastUpdate === null) this.lastUpdate = timestamp;
        const deltaSeconds = Math.min(0.1, Math.max(0, timestamp - this.lastUpdate) / 1000);
        this.lastUpdate = timestamp;
        const closedLayout = this.getPanelTarget(false);
        if (this.panelSize === null) {
            this.panelX = closedLayout.x;
            this.panelY = closedLayout.y;
            this.panelSize = closedLayout.size;
        }
        const target = this.getPanelTarget(this.open);
        const layoutEase = 1 - Math.exp(-deltaSeconds * 6);
        this.panelX += (target.x - this.panelX) * layoutEase;
        this.panelY += (target.y - this.panelY) * layoutEase;
        this.panelSize += (target.size - this.panelSize) * layoutEase;

        if (this.returning) {
            const easing = 1 - Math.exp(-deltaSeconds * 6);
            this.pitch = approachAngle(this.pitch, 0, easing);
            this.roll = approachAngle(this.roll, 0, easing);
            this.zoom += (1 - this.zoom) * easing;

            const closed = this.getPanelTarget(false);
            const panelSettled = Math.abs(this.panelX - closed.x) < 1 &&
                Math.abs(this.panelY - closed.y) < 1 && Math.abs(this.panelSize - closed.size) < 1;
            const viewSettled = Math.abs(this.pitch) < 0.01 && Math.abs(this.roll) < 0.01 &&
                Math.abs(this.zoom - 1) < 0.01;
            if (panelSettled && viewSettled) {
                this.pitch = 0;
                this.roll = 0;
                this.zoom = 1;
                this.returning = false;
            }
        }
        if (this.rotationActive) this.yaw += deltaSeconds * 0.12;
    }

    // Start a panel transition and only reset the view as it closes.
    setOpen(open) {
        if (this.open === open) return;
        this.open = open;
        this.returning = !open;
        if (!open) this.rotationActive = true;
        this.dragging = false;
    }

    // Keep a compact map preview visible and expand it into a centered menu.
    draw(ctx, world, player) {
        const { x, y, size } = this.getPanelLayout();
        const views = this.mapScale.getViews(world, player.pos);
        // Bounded and expanding unbounded maps share the world origin as their center.
        const center = [0, 0, 0];

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, size, size, 10);
        ctx.clip();
        ctx.fillStyle = 'rgba(5, 12, 22, 0.88)';
        ctx.fillRect(x, y, size, size);

        const gridOpacity = Math.pow(Math.max(0, Math.min(1, this.zoom)), 2.2);
        const scene = [];
        for (const view of views) {
            const mapScale = (MAP_CUBE_PIXEL_SPAN / (view.cameraExtent * 2 * Math.sqrt(3))) * this.zoom;
            const project = this.createProjector(center, mapScale, x, y, size);
            const viewScene = [];
            this.addGridLines(viewScene, project, view.extent, gridOpacity);
            this.addAxisLabels(viewScene, project, view.extent);
            this.addPlayerMarkers(viewScene, project, world, player);
            this.addBorderLines(viewScene, project, view.extent, world.borderDistance !== null);
            for (const item of viewScene) item.opacity = view.opacity;
            scene.push(...viewScene);
        }
        // Render one pointer in the active camera frame while both cube sizes fade.
        const activeView = views[0];
        const activeScale = (MAP_CUBE_PIXEL_SPAN / (activeView.cameraExtent * 2 * Math.sqrt(3))) * this.zoom;
        this.addPlayerMarker(scene, this.createProjector(center, activeScale, x, y, size), player, activeScale);
        this.drawDepthOrderedScene(ctx, scene);

        // Label the cube that is currently most visible, switching once at fade midpoint.
        const prominentView = views.reduce((prominent, view) =>
            view.opacity > prominent.opacity ? view : prominent, views[0]);
        const localSquareSize = prominentView.extent * 2;

        ctx.restore();
        this.drawPanelLabels(ctx, x, y, size, world.borderDistance !== null, localSquareSize);
    }

    // Compute compact corner and centered expanded panel positions.
    getPanelTarget(open) {
        const size = Math.min(
            open ? OPEN_PANEL_SIZE : CLOSED_PANEL_SIZE,
            Math.max(1, this.canvas.width - 24),
            Math.max(1, this.canvas.height - 24),
        );
        return open
            ? { x: (this.canvas.width - size) * 0.5, y: (this.canvas.height - size) * 0.5, size }
            : { x: this.canvas.width - size - 12, y: this.canvas.height - size - 12, size };
    }

    // Return the current animated panel bounds, initializing the closed preview.
    getPanelLayout() {
        if (this.panelSize === null) {
            const initial = this.getPanelTarget(false);
            this.panelX = initial.x;
            this.panelY = initial.y;
            this.panelSize = initial.size;
        }
        return { x: this.panelX, y: this.panelY, size: this.panelSize };
    }

    // Rotate coordinates around the selected world center and project them to the HUD.
    createProjector(center, scale, left, top, size) {
        let right = rotateAroundAxis(MAP_RIGHT, MAP_UP, this.yaw);
        let depth = rotateAroundAxis(MAP_DEPTH, MAP_UP, this.yaw);
        let up = rotateAroundAxis(MAP_UP, right, this.pitch);
        depth = rotateAroundAxis(depth, right, this.pitch);
        right = rotateAroundAxis(right, depth, this.roll);
        up = rotateAroundAxis(up, depth, this.roll);
        return point => {
            const dx = point[0] - center[0], dy = point[1] - center[1], dz = point[2] - center[2];
            const pointDepth = dx * depth[0] + dy * depth[1] + dz * depth[2];
            const screenX = dx * right[0] + dy * right[1] + dz * right[2];
            const screenY = dx * up[0] + dy * up[1] + dz * up[2];
            return [left + size * 0.5 + screenX * scale, top + size * 0.52 - screenY * scale, pointDepth];
        };
    }

    // Add a 3x3x3 gray lattice with stronger zoom and distance fading.
    addGridLines(scene, project, extent, zoomOpacity) {
        const levels = Array.from({ length: GRID_DIVISIONS + 1 }, (_, index) =>
            -extent + (2 * extent * index) / GRID_DIVISIONS);
        const addLine = (start, end) => {
            const first = project(start), second = project(end);
            const depth = (first[2] + second[2]) * 0.5;
            const depthOpacity = 0.2 + 0.8 * Math.max(0, Math.min(1,
                (depth + Math.sqrt(3) * extent) / (2 * Math.sqrt(3) * extent)));
            scene.push({
                kind: 'line', x1: first[0], y1: first[1], x2: second[0], y2: second[1],
                depth,
                color: `rgba(215, 222, 228, ${0.72 * zoomOpacity * depthOpacity})`, width: 2.35,
            });
        };

        for (let i = 0; i <= GRID_DIVISIONS; i++) {
            const coordinate = levels[i];
            for (let j = 0; j <= GRID_DIVISIONS; j++) {
                const other = levels[j];
                addLine([-extent, coordinate, other], [extent, coordinate, other]);
                addLine([coordinate, -extent, other], [coordinate, extent, other]);
                addLine([other, coordinate, -extent], [other, coordinate, extent]);
            }
        }
    }

    // Keep translucent axis labels clear of the cube edges and grid lines.
    addAxisLabels(scene, project, extent) {
        const labels = [
            { text: '+x', point: [extent * 1.45, 0, 0], color: 'rgba(255, 125, 125, 0.72)' },
            { text: '-x', point: [-extent * 1.45, 0, 0], color: 'rgba(255, 125, 125, 0.72)' },
            { text: '+y', point: [0, extent * 1.45, 0], color: 'rgba(135, 255, 165, 0.72)' },
            { text: '-y', point: [0, -extent * 1.45, 0], color: 'rgba(135, 255, 165, 0.72)' },
            { text: '+z', point: [0, 0, extent * 1.45], color: 'rgba(125, 175, 255, 0.72)' },
            { text: '-z', point: [0, 0, -extent * 1.45], color: 'rgba(125, 175, 255, 0.72)' },
        ];
        for (const label of labels) {
            const [x, y, depth] = project(label.point);
            scene.push({
                kind: 'text', text: label.text, x, y, depth, color: label.color,
                font: 'bold 12px Tahoma', align: 'center', baseline: 'middle',
            });
        }
    }

    // Add a depth-aware position marker for every connected player.
    addPlayerMarkers(scene, project, world, player) {
        for (const entity of world.mapPlayers.values()) {
            if (entity.id === player.id) continue;
            const [x, y, depth] = project(entity.pos);
            scene.push({ kind: 'circle', x, y, radius: 4, depth, color: '#ffcc55' });
        }
    }

    // Add RGB-coded outside edges so each world axis remains easy to identify.
    addBorderLines(scene, project, extent, bounded) {
        const corners = [];
        for (const z of [-extent, extent]) for (const y of [-extent, extent]) for (const x of [-extent, extent]) {
            corners.push(project([x, y, z]));
        }
        const edges = {
            x: [[0,1],[2,3],[4,5],[6,7]],
            y: [[0,2],[1,3],[4,6],[5,7]],
            z: [[0,4],[1,5],[2,6],[3,7]],
        };
        const colors = { x: [255, 115, 115], y: [125, 255, 155], z: [115, 165, 255] };
        const farthestCorner = corners.reduce((farthest, point, index) =>
            point[2] < corners[farthest][2] ? index : farthest, 0);
        for (const axis of ['x', 'y', 'z']) {
            for (const [a, b] of edges[axis]) {
                const isBackCornerEdge = a === farthestCorner || b === farthestCorner;
                const alpha = bounded
                    ? (isBackCornerEdge ? 0.28 : 0.95)
                    : (isBackCornerEdge ? 0.18 : 0.55);
                scene.push({
                    kind: 'line', x1: corners[a][0], y1: corners[a][1],
                    x2: corners[b][0], y2: corners[b][1],
                    depth: (corners[a][2] + corners[b][2]) * 0.5,
                    color: `rgba(${colors[axis].join(', ')}, ${alpha})`, width: bounded ? 3 : 2.25,
                    dash: bounded ? [] : [4, 4],
                });
            }
        }
    }

    // Add the local player's 3D tetrahedron faces to the depth-sorted scene.
    addPlayerMarker(scene, project, player, mapScale) {
        const { forward, right, up } = getViewBasis(player.orientation);
        const markerLength = 19 / mapScale;
        const offset = (...vectors) => vectors.reduce((point, [vector, amount]) =>
            point.map((value, axis) => value + vector[axis] * amount), [...player.pos]);
        const apex = offset([forward, markerLength]);
        const vertices = [
            apex,
            offset([forward, -markerLength * 0.45], [right, markerLength * 0.55]),
            offset([forward, -markerLength * 0.45], [right, -markerLength * 0.275], [up, markerLength * 0.476]),
            offset([forward, -markerLength * 0.45], [right, -markerLength * 0.275], [up, -markerLength * 0.476]),
        ].map(project);
        const faces = [
            { indices: [0, 1, 2], color: 'rgba(255, 105, 95, 0.98)' },
            { indices: [0, 2, 3], color: 'rgba(220, 65, 70, 0.98)' },
            { indices: [0, 3, 1], color: 'rgba(255, 145, 115, 0.98)' },
            { indices: [1, 3, 2], color: 'rgba(145, 42, 55, 0.98)' },
        ];
        for (const face of faces) {
            const points = face.indices.map(index => vertices[index]);
            scene.push({
                kind: 'polygon', points, depth: points.reduce((sum, point) => sum + point[2], 0) / 3,
                color: face.color, outline: 'rgba(35, 12, 18, 0.95)',
            });
        }
    }

    // Paint far geometry first so front border lines cover player identifiers.
    drawDepthOrderedScene(ctx, scene) {
        scene.sort((a, b) => a.depth - b.depth);
        for (const item of scene) {
            const baseAlpha = ctx.globalAlpha;
            ctx.globalAlpha = baseAlpha * (item.opacity ?? 1);
            if (item.kind === 'line') {
                ctx.beginPath();
                ctx.moveTo(item.x1, item.y1);
                ctx.lineTo(item.x2, item.y2);
                ctx.strokeStyle = item.color;
                ctx.lineWidth = item.width;
                ctx.setLineDash(item.dash ?? []);
                ctx.stroke();
                ctx.globalAlpha = baseAlpha;
                continue;
            }
            if (item.kind === 'circle') {
                ctx.beginPath();
                ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
                ctx.fillStyle = item.color;
                ctx.fill();
                ctx.strokeStyle = '#241b08';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.globalAlpha = baseAlpha;
                continue;
            }
            if (item.kind === 'text') {
                ctx.font = item.font;
                ctx.textAlign = item.align ?? 'left';
                ctx.textBaseline = item.baseline ?? 'bottom';
                ctx.fillStyle = item.color;
                ctx.fillText(item.text, item.x, item.y);
                ctx.globalAlpha = baseAlpha;
                continue;
            }
            const [first, ...rest] = item.points;
            ctx.beginPath();
            ctx.moveTo(first[0], first[1]);
            for (const point of rest) ctx.lineTo(point[0], point[1]);
            ctx.closePath();
            ctx.fillStyle = item.color;
            ctx.fill();
            ctx.strokeStyle = item.outline;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = baseAlpha;
        }
        ctx.setLineDash([]);
    }

    // Draw the panel frame and concise interaction hints after clipped content.
    drawPanelLabels(ctx, x, y, size, bounded, localSquareSize) {
        ctx.save();
        ctx.strokeStyle = 'rgba(180, 225, 245, 0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, size, size, 10);
        ctx.stroke();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Tahoma';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(bounded ? 'WORLD MAP' : 'WORLD MAP · LOCAL', x + 10, y + 8);
        ctx.font = '10px Tahoma';
        ctx.fillStyle = 'rgba(230, 245, 250, 0.85)';
        if (this.open) {
            ctx.textBaseline = 'bottom';
            ctx.textAlign = 'left';
            ctx.fillText('Drag: rotate  ·  Wheel: zoom  ·  M: close', x + 10, y + size - 7);
        } else {
            ctx.textBaseline = 'bottom';
            ctx.textAlign = 'left';
            ctx.fillText('M: open', x + 10, y + size - 7);
        }
        if (!bounded) {
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`${Math.round(localSquareSize)} units per side`, x + size - 10, y + size - 7);
        }
        ctx.restore();
    }

    // Begin map rotation only when the pointer is inside the panel.
    beginDrag(event) {
        if (!this.open) return;
        event.preventDefault();
        event.stopPropagation();
        if (!this.contains(event.clientX, event.clientY)) return;
        this.dragging = true;
        this.rotationActive = false;
        this.lastPointer = [event.clientX, event.clientY];
    }

    // Rotate the map view while the user drags over the panel.
    drag(event) {
        if (!this.dragging) return;
        const dx = event.clientX - this.lastPointer[0], dy = event.clientY - this.lastPointer[1];
        this.yaw -= dx * 0.008;
        this.pitch -= dy * 0.008;
        this.lastPointer = [event.clientX, event.clientY];
    }

    // Scale the map around its center when the wheel is used over the panel.
    scale(event) {
        if (!this.open || !this.contains(event.clientX, event.clientY)) return;
        event.preventDefault();
        this.rotationActive = false;
        this.zoom = Math.max(0.45, Math.min(8, this.zoom * Math.exp(-event.deltaY * 0.001)));
    }

    // Convert screen coordinates to the map's current panel bounds.
    contains(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const { x, y, size } = this.getPanelLayout();
        const px = clientX * this.canvas.width / rect.width;
        const py = clientY * this.canvas.height / rect.height;
        return px >= x && px <= x + size && py >= y && py <= y + size;
    }
}

// Rotate one view vector around a unit axis without allocating a matrix.
function rotateAroundAxis(vector, axis, angle) {
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const axisCrossVector = cross(axis, vector);
    const projection = dot(axis, vector) * (1 - cosine);
    return vector.map((value, index) =>
        value * cosine + axisCrossVector[index] * sine + axis[index] * projection);
}

// Move an angular view value toward zero using the shortest wraparound direction.
function approachAngle(angle, target, amount) {
    const difference = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
    return angle + difference * amount;
}

// Normalize the fixed camera basis vectors used by the cube-corner-up view.
function normalize(vector) {
    const length = Math.hypot(...vector) || 1;
    return vector.map(value => value / length);
}

// Compute the three-dimensional cross product for view-basis construction.
function cross([ax, ay, az], [bx, by, bz]) {
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

// Compute a three-dimensional dot product for axis-angle camera rotation.
function dot(first, second) {
    return first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
}
