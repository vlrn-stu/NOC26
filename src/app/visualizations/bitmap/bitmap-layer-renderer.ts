import {FrameState} from "ol/Map";
import ViewHint from "ol/ViewHint";
import {getTransform, Projection} from "ol/proj";
import LayerRenderer from "ol/renderer/Layer";
import {compose as composeTransform, create as createTransform} from "ol/transform";
import {Subscription} from "rxjs";
import {BITMAP_FRAGMENT_SHADER, BITMAP_VERTEX_SHADER} from "./bitmap-shaders";
import {Gradient, GradientMode, MAX_GRADIENT_STOPS} from "../../types/gradients.type";
import {GridData} from "../../data-types/grid-data";
import type {BitmapLayer} from "./bitmap-layer";

/**
 * The grid is drawn as a mesh of this many segments in each direction. The data is in
 * longitude/latitude but the map uses another projection (Web Mercator by default), so the
 * corners of every segment are reprojected to bend the grid to the map's shape.
 */
const MESH_SEGMENTS = 32;

/**
 * Draws a `GridData` from an `EdrGridSource` onto its own WebGL2 canvas, colouring every pixel with
 * the gradient. Fetches new data for the visible area whenever the map stops moving.
 */
export class BitmapLayerRenderer extends LayerRenderer<BitmapLayer> {
    private readonly canvas = document.createElement("canvas");
    private readonly gl: WebGL2RenderingContext;
    private readonly program: WebGLProgram;
    private readonly vertexArray: WebGLVertexArrayObject;
    private readonly positionBuffer: WebGLBuffer;
    private readonly uvBuffer: WebGLBuffer;
    private readonly indexBuffer: WebGLBuffer;
    private readonly dataTexture: WebGLTexture;
    private readonly matrixLocation: WebGLUniformLocation | null;
    private readonly transform = createTransform();

    /** Number of mesh indices to draw; 0 while there is no data to show. */
    private indexCount = 0;
    /**
     * Map coordinates of the mesh centre. Vertex positions are stored relative to it, because
     * Web Mercator coordinates are in millions of metres and would lose precision as 32-bit floats.
     */
    private meshOrigin: [number, number] = [0, 0];
    private requestedBboxKey?: string;
    private request?: Subscription;

    constructor(layer: BitmapLayer, gradient: Gradient, gradientMode: GradientMode) {
        super(layer);
        this.canvas.style.position = "absolute";
        this.canvas.style.left = "0";
        this.canvas.style.top = "0";

        const gl = this.canvas.getContext("webgl2");
        if (!gl) {
            throw new Error("WebGL2 is not supported by this browser");
        }
        this.gl = gl;
        this.program = createProgram(gl, BITMAP_VERTEX_SHADER, BITMAP_FRAGMENT_SHADER);
        this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
        this.setGradientUniforms(gradient, gradientMode);

        this.vertexArray = gl.createVertexArray();
        this.positionBuffer = gl.createBuffer();
        this.uvBuffer = gl.createBuffer();
        this.indexBuffer = gl.createBuffer();
        gl.bindVertexArray(this.vertexArray);
        this.bindAttribute("a_position", this.positionBuffer);
        this.bindAttribute("a_uv", this.uvBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bindVertexArray(null);

        // Float textures cannot be filtered on every GPU, so the shader reads exact texels with
        // texelFetch() and interpolates on its own. NEAREST also keeps the texture complete
        // without mipmaps.
        this.dataTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.dataTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    /** Called by OpenLayers before every frame; returns whether there is anything to draw. */
    override prepareFrame(frameState: FrameState): boolean {
        const viewIsMoving =
            frameState.viewHints[ViewHint.ANIMATING] > 0 ||
            frameState.viewHints[ViewHint.INTERACTING] > 0;
        // Wait until panning or zooming finishes, so we don't send a request for every frame.
        if (!viewIsMoving) {
            this.requestData(frameState);
        }
        return this.indexCount > 0;
    }

    /** Called by OpenLayers to draw the layer; returns the element that shows it. */
    override renderFrame(frameState: FrameState): HTMLElement {
        const gl = this.gl;
        const [width, height] = frameState.size;
        const {center, resolution, rotation} = frameState.viewState;
        this.resizeCanvas(width, height, frameState.pixelRatio);
        this.canvas.style.opacity = String(frameState.layerStatesArray[frameState.layerIndex].opacity);

        // Map coordinates (relative to the mesh origin) -> clip space (-1..1).
        composeTransform(
            this.transform,
            0,
            0,
            2 / (resolution * width),
            2 / (resolution * height),
            -rotation,
            this.meshOrigin[0] - center[0],
            this.meshOrigin[1] - center[1]
        );
        const [a, b, c, d, e, f] = this.transform;

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        gl.uniformMatrix3fv(this.matrixLocation, false, [a, b, 0, c, d, 0, e, f, 1]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.dataTexture);
        gl.bindVertexArray(this.vertexArray);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);

        return this.canvas;
    }

    protected override disposeInternal(): void {
        this.request?.unsubscribe();
        const gl = this.gl;
        gl.deleteTexture(this.dataTexture);
        gl.deleteBuffer(this.positionBuffer);
        gl.deleteBuffer(this.uvBuffer);
        gl.deleteBuffer(this.indexBuffer);
        gl.deleteVertexArray(this.vertexArray);
        gl.deleteProgram(this.program);
        // Browsers allow only a few WebGL contexts at once, so release this one right away.
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        super.disposeInternal();
    }

    /** Fetches the grid for the visible area, unless the same area was already requested. */
    private requestData(frameState: FrameState): void {
        const source = this.getLayer().getSource();
        const projection = frameState.viewState.projection;
        const bbox = source?.getRequestBbox(frameState.extent!, projection);
        const time = source?.getTime() ?? "";
        // The old grid stays on screen until the new one arrives, so changing the time does not flicker.
        const bboxKey = bbox ? `${bbox.join(",")}@${time}` : "outside";
        if (bboxKey === this.requestedBboxKey) {
            return;
        }
        this.requestedBboxKey = bboxKey;
        this.request?.unsubscribe();

        if (!source || !bbox) {
            this.indexCount = 0;
            return;
        }
        this.request = source.getGridData(bbox, time).subscribe({
            next: grid => {
                this.uploadGrid(grid, projection);
                // Asks the map to render again, now with the new data.
                this.getLayer().changed();
            },
            error: (error: unknown) => {
                console.error("Failed to load the grid data", error);
                // Allow the same area to be requested again after the next map move.
                this.requestedBboxKey = undefined;
            },
        });
    }

    /** Copies the grid values into the data texture and builds the mesh that covers the grid. */
    private uploadGrid(grid: GridData, projection: Projection): void {
        const gl = this.gl;
        if (grid.width < 2 || grid.height < 2) {
            this.indexCount = 0;
            return;
        }

        gl.bindTexture(gl.TEXTURE_2D, this.dataTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RG32F,
            grid.width,
            grid.height,
            0,
            gl.RG,
            gl.FLOAT,
            packGridTexels(grid.values)
        );

        const mesh = createGridMesh(grid, projection);
        this.meshOrigin = mesh.origin;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
        gl.bindVertexArray(this.vertexArray);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        this.indexCount = mesh.indices.length;
    }

    private setGradientUniforms(gradient: Gradient, gradientMode: GradientMode): void {
        if (gradient.length === 0 || gradient.length > MAX_GRADIENT_STOPS) {
            throw new Error(`A gradient needs 1 to ${MAX_GRADIENT_STOPS} stops`);
        }
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniform1i(gl.getUniformLocation(this.program, "u_data"), 0);
        gl.uniform1i(gl.getUniformLocation(this.program, "u_stopCount"), gradient.length);
        gl.uniform1i(
            gl.getUniformLocation(this.program, "u_stepped"),
            gradientMode === "stepped" ? 1 : 0
        );
        gl.uniform1fv(
            gl.getUniformLocation(this.program, "u_stopValues"),
            gradient.map(stop => stop.value)
        );
        gl.uniform4fv(
            gl.getUniformLocation(this.program, "u_stopColors"),
            gradient.flatMap(stop => stop.color.map(channel => channel / 255))
        );
    }

    private bindAttribute(name: string, buffer: WebGLBuffer): void {
        const gl = this.gl;
        const location = gl.getAttribLocation(this.program, name);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    }

    private resizeCanvas(width: number, height: number, pixelRatio: number): void {
        const canvasWidth = Math.round(width * pixelRatio);
        const canvasHeight = Math.round(height * pixelRatio);
        if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
            this.canvas.width = canvasWidth;
            this.canvas.height = canvasHeight;
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
        }
    }
}

/**
 * Turns grid values into two-channel texels: (value, 1) where there is data and (0, 0) where the
 * value is missing (NaN). The shader then never has to test for NaN itself: interpolating both
 * channels tells it how much of each pixel's neighbourhood has data.
 */
function packGridTexels(values: Float32Array): Float32Array {
    const texels = new Float32Array(values.length * 2);
    values.forEach((value, i) => {
        if (!Number.isNaN(value)) {
            texels[i * 2] = value;
            texels[i * 2 + 1] = 1;
        }
    });
    return texels;
}

/**
 * Builds a mesh of `MESH_SEGMENTS` × `MESH_SEGMENTS` rectangles over the grid, reprojected from
 * longitude/latitude to the map projection. The mesh reaches half a cell beyond the outermost
 * grid points, so every grid point sits in the middle of its own cell.
 */
function createGridMesh(
    grid: GridData,
    projection: Projection
): {positions: Float32Array; uvs: Float32Array; indices: Uint16Array; origin: [number, number]} {
    const toMap = getTransform("EPSG:4326", projection);
    if (!toMap) {
        throw new Error(`Cannot reproject the grid to ${projection.getCode()}`);
    }
    const west = grid.extent[0] - grid.cellWidth / 2;
    const east = grid.extent[2] + grid.cellWidth / 2;
    const south = grid.extent[1] - grid.cellHeight / 2;
    const north = grid.extent[3] + grid.cellHeight / 2;
    const center = toMap([(west + east) / 2, (south + north) / 2]);
    const origin: [number, number] = [center[0], center[1]];

    const verticesPerRow = MESH_SEGMENTS + 1;
    const positions = new Float32Array(verticesPerRow * verticesPerRow * 2);
    const uvs = new Float32Array(verticesPerRow * verticesPerRow * 2);
    for (let row = 0, i = 0; row <= MESH_SEGMENTS; row++) {
        for (let column = 0; column <= MESH_SEGMENTS; column++, i += 2) {
            const u = column / MESH_SEGMENTS;
            const v = row / MESH_SEGMENTS;
            const [x, y] = toMap([west + u * (east - west), north - v * (north - south)]);
            positions[i] = x - origin[0];
            positions[i + 1] = y - origin[1];
            uvs[i] = u;
            uvs[i + 1] = v;
        }
    }

    // Two triangles per rectangle of the mesh.
    const indices = new Uint16Array(MESH_SEGMENTS * MESH_SEGMENTS * 6);
    for (let row = 0, i = 0; row < MESH_SEGMENTS; row++) {
        for (let column = 0; column < MESH_SEGMENTS; column++, i += 6) {
            const topLeft = row * verticesPerRow + column;
            const bottomLeft = topLeft + verticesPerRow;
            indices.set([topLeft, bottomLeft, topLeft + 1, topLeft + 1, bottomLeft, bottomLeft + 1], i);
        }
    }

    return {positions, uvs, indices, origin};
}

function createProgram(
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string
): WebGLProgram {
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Failed to link the shader program: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
}

function compileShader(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) {
        throw new Error("Failed to create a shader");
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Failed to compile a shader: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
}
