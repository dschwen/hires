// color mode. If this is true setting a third color will recolor the block so that
// the smallest number of pixels is changed, otherwise it will recolor all pixels
// with the same coloer as the pixel underneath the pointer (MultiPaint default))
var minimal_pixel_change = true;

// import using dithering?
var dithering = false;

// block data
class Block {
  constructor(copy) {
    if (copy) {
      this.fg = copy.fg;
      this.bg = copy.bg;
      this.pix = Array.apply(null, Array(8)).map((x,i) => {return copy.pix[i];});
    } else {
      this.fg = 1;
      this.bg = 0;
      this.pix = Array.apply(null, Array(8)).map(() => {return 0;});
    }
  }

  clear() {
    this.fg = 1;
    this.bg = 0;
    this.pix.fill(0);
  }

  fillBlock(color) {
    this.clear();
    this.bg = color;
  }

  random() {
    this.fg = Math.floor(Math.random() * 16);
    this.bg = Math.floor(Math.random() * 16);
    this.pix = Array.apply(null, Array(8)).map(() => {return Math.floor(Math.random() * 256);});
  }

  getPixel(x, y) {
    var is_set = this.pix[y] & (1 << (7-x));
    if (is_set)
      return this.fg;
    return this.bg;
  }

  setPixel(x, y, color) {
    var is_set = this.pix[y] & (1 << (7-x));

    // no color change necessary
    if (this.fg == color) {
      if (!is_set)
        this.pix[y] += (1 << (7-x));
      return;
    }
    if (this.bg == color) {
      if (is_set)
        this.pix[y] -= (1 << (7-x));
      return;
    }

    // count number of set pixels in the current block
    var sum = this.pix.reduce((accu, v) => { return accu + Block.bitcount[v]; }, 0);
    if (sum == 0) {
      // block has no pixels set, we are free to reset the foreground color
      this.fg = color;
      this.pix[y] += (1 << (7-x));
    }
    else if (sum == 64 && this.fg != color) {
      // block has all pixels set, we are free to reset the background color
      this.bg = color;
      this.pix[y] -= (1 << (7-x));
    }
    else {
      // some pixels are set, some are not. Proceed depending on the color change model
      if (minimal_pixel_change) {
        // try to set with recoloring as few pixels as possible
        if (sum <= 32) {
          if (is_set) {
            // change foreground color
            this.fg = color;
          }
          else {
            this.fg = color;
            this.pix[y] += (1 << (7-x));
          }
        } else {
          if (!is_set) {
            // change background color
            this.bg = color;
          }
          else {
            this.bg = color;
            this.pix[y] -= (1 << (7-x));
          }
        }
      } else {
        // recolor all pixels that are like the pixel at these coordinates
        if (is_set)
          this.fg = color;
        else
          this.bg = color;
      }
    }
  }

  // initialize bit count table (to quickly count the number of set pixels in a block)
  static initBitCount() {
    Block.bitcount = Array.apply(null, Array(256)).map((c, byte) => {
      var count = 0;
      while (byte != 0) {
        if (byte & 1)
          count++;
        byte = (byte >> 1);
      }
      return count;
    });
  }
}

// initialize static data in Block
Block.initBitCount();

class Painting {
  constructor(copy) {
  }
}

class ViewPort {
  constructor() {
  }
}

// size of canvas in blocks
var nbx, nby;
var urlmatch = /#(\d+)x(\d+)blocks/.exec(document.location.hash);
console.log(urlmatch);
if (urlmatch) {
  nbx = parseInt(urlmatch[1], 10);
  nby = parseInt(urlmatch[2], 10);
} else {
  nbx = 320/8;
  nby = 200/8;
}

// image data
var image;

// restore image or set up new empty image
(function() {
  var data = window.localStorage.getItem('current_image');
  if (data) {
    // restore from localStorage
    restoreImage(data);
  } else {
    // new empty image
    image = Array.apply(null, Array(nbx * nby)).map(() => {return new Block();});
  }
})();

// html canvases
var backbuffer = document.getElementById('backbuffer');
var canvas = document.getElementById('canvas');
backbuffer.width = nbx * 8;
backbuffer.height = nby * 8;

// rendering contexts
var ctx = backbuffer.getContext('2d');
var frontctx = canvas.getContext('2d');

// rendering block buffer
var bbuf = ctx.createImageData(8, 8);

// scrolling viewport
var viewport = document.getElementById('viewport');

// draw gridlines?
var grid = true;

// murky palette
var murky_palette = [
  { "red": 0,   "green": 0,   "blue": 0,   "name": "black"       },
  { "red": 255, "green": 255, "blue": 255, "name": "white"       },
  { "red": 104, "green": 55,  "blue": 43,  "name": "red"         },
  { "red": 112, "green": 164, "blue": 178, "name": "cyan"        },
  { "red": 111, "green": 61,  "blue": 134, "name": "purple"      },
  { "red": 88,  "green": 141, "blue": 67,  "name": "green"       },
  { "red": 53,  "green": 40,  "blue": 121, "name": "blue"        },
  { "red": 184, "green": 199, "blue": 111, "name": "yellow"      },
  { "red": 111, "green": 79,  "blue": 37,  "name": "orange"      },
  { "red": 67,  "green": 57,  "blue": 0,   "name": "brown"       },
  { "red": 154, "green": 103, "blue": 89,  "name": "light red"   },
  { "red": 68,  "green": 68,  "blue": 68,  "name": "dark grey"   },
  { "red": 108, "green": 108, "blue": 108, "name": "grey"        },
  { "red": 154, "green": 210, "blue": 132, "name": "light green" },
  { "red": 108, "green": 94,  "blue": 181, "name": "light blue"  },
  { "red": 149, "green": 149, "blue": 149, "name": "light grey"  }
];
// lively palette
var lively_palette = [
  { "red": 0,   "green": 0,   "blue": 0,   "name": "black"       },
  { "red": 255, "green": 255, "blue": 255, "name": "white"       },
  { "red": 136, "green": 0,   "blue": 0,   "name": "red"         },
  { "red": 170, "green": 255, "blue": 238, "name": "cyan"        },
  { "red": 204, "green": 68,  "blue": 204, "name": "purple"      },
  { "red": 0,   "green": 204, "blue": 85,  "name": "green"       },
  { "red": 0,   "green": 0,   "blue": 170, "name": "blue"        },
  { "red": 238, "green": 238, "blue": 119, "name": "yellow"      },
  { "red": 221, "green": 136, "blue": 85,  "name": "orange"      },
  { "red": 102, "green": 68,  "blue": 0,   "name": "brown"       },
  { "red": 255, "green": 119, "blue": 119, "name": "light red"   },
  { "red": 51,  "green": 51,  "blue": 51,  "name": "dark grey"   },
  { "red": 119, "green": 119, "blue": 119, "name": "grey"        },
  { "red": 170, "green": 255, "blue": 102, "name": "light green" },
  { "red": 0,   "green": 136, "blue": 255, "name": "light blue"  },
  { "red": 187, "green": 187, "blue": 187, "name": "light grey"  }
];
var palette = murky_palette;

// current fg color index for drawing
var fg = 1, bg = 0;

// preview block
var preview;

// draw a single Block
function drawBlock(bx, by, block)
{
  var byte, bit, idx = 0, col;
  for (byte = 0; byte < 8; ++byte)
    for (bit = 7; bit >= 0; --bit)
    {
      is_set = block.pix[byte] & (1 << bit);
      if (is_set)
        col = block.fg;
      else
        col = block.bg;

      bbuf.data[idx++] = palette[col].red;
      bbuf.data[idx++] = palette[col].green;
      bbuf.data[idx++] = palette[col].blue;
      bbuf.data[idx++] = 255;
    }

  // ctx.putImageData(bbuf, bx * 8, (nby - by - 1) * 8);
  ctx.putImageData(bbuf, bx * 8, by * 8);
}

// update front buffer
function updateFrontBuffer()
{
  // upscale without interpolation
  frontctx.imageSmoothingEnabled = false;
  frontctx.drawImage(backbuffer, 0, 0, backbuffer.width, backbuffer.height, 0, 0, canvas.width, canvas.height);

  // draw gridlines
  if (grid) {
    var space = 8 * (1 << zoom);
    var bx, by;

    frontctx.imageSmoothingEnabled = true;
    frontctx.lineWidth = 0.5;
    for (bx = 0; bx <= nbx; ++bx) {
      frontctx.beginPath();
      frontctx.moveTo(bx * space, 0);
      frontctx.lineTo(bx * space, (nbx+1) * space);
      frontctx.strokeStyle = 'white';
      frontctx.stroke();
      frontctx.strokeStyle = 'black';
      frontctx.stroke();
    }
    for (by = 0; by <= nbx; ++by) {
      frontctx.beginPath();
      frontctx.moveTo(0, by * space);
      frontctx.lineTo((nbx+1) * space, by * space);
      frontctx.strokeStyle = 'white';
      frontctx.stroke();
      frontctx.strokeStyle = 'black';
      frontctx.stroke();
    }
  }
}

// clear image
function clear()
{
  for (by = 0; by < nby; ++by)
    for (bx = 0; bx < nbx; ++bx)
      image[bx + by * nbx].clear();
}

// randomize image
function randomize()
{
  for (by = 0; by < nby; ++by)
    for (bx = 0; bx < nbx; ++bx)
      image[bx + by * nbx].random();
}

// redraw image
function redraw()
{
  var bx, by;
  for (by = 0; by < nby; ++by)
    for (bx = 0; bx < nbx; ++bx)
      drawBlock(bx, by, image[bx + by * nbx]);
  updateFrontBuffer();
}

// set a pixel at given coordinates using an block object
function fillBlock(px, py, color, draw) {
  var bx = px >> 3, by = py >> 3;
  var block;
  if (draw) {
    block = image[bx + by * nbx];
  } else {
    block = new Block(image[bx + by * nbx]);
  }
  block.fillBlock(color);
  drawBlock(bx, by, block);
}

// set a pixel at given coordinates using an block object
function setPixel(px, py, color, draw) {
  var bx = px >> 3, by = py >> 3;
  var block;
  if (draw) {
    block = image[bx + by * nbx];
  } else {
    block = new Block(image[bx + by * nbx]);
  }
  block.setPixel(px % 8, py % 8, color);
  drawBlock(bx, by, block);
}


// serialize image for exporting and emergency save
function serializeImage()
{
  var i, j, blocks = nbx * nby;
  var size =  blocks * 9 + 2;
  buf = new Uint8Array(new ArrayBuffer(size));
  // header (width and height)
  buf[0] = nbx;
  buf[1] = nby;

  // serialize fg/bg data
  for (i = 0; i < blocks; ++i)
    buf[i+2] = image[i].fg + (image[i].bg << 4);

  // serialize bitmap data
  for (i = 0; i < blocks; ++i)
    for (j = 0; j < 8; ++j)
      buf[i*8+j+blocks+2] = image[i].pix[j];

  return window.btoa(buf);
}

// serialize image for exporting and emergency save
function restoreImage(data)
{
  var buf = new Uint8Array(JSON.parse('[' + window.atob(data) + ']'));
  // header (width and height)
  //nbx = buf[0];
  //nby = buf[1];

  // only restore if the size matches!
  if (nbx != buf[0] || nby != buf[1]) {
    image = Array.apply(null, Array(nbx * nby)).map(() => {return new Block();});
    return;
  }

  var i, j, blocks = nbx * nby;
  var size =  blocks * 9 + 2;
  if (buf.length != size) {
    alert("Corrupt image data");
  }
  image = Array.apply(null, Array(blocks)).map(() => {return new Block();});

  // unserialize fg/bg data
  for (i = 0; i < blocks; ++i) {
    image[i].fg = buf[i+2] % 16;
    image[i].bg = buf[i+2] >> 4;
  }

  // unserialize bitmap data
  for (i = 0; i < blocks; ++i)
    for (j = 0; j < 8; ++j)
      image[i].pix[j] = buf[i*8+j+blocks+2];
}

// undo data
var undodata = [], undocurrent;
var undopointer = 0;

function undo() {
  if (undopointer > 0) {
    if (undopointer == undodata.length) {
      // save current state if we at the end of the undo chain
      undocurrent = serializeImage();
    }
    undopointer--;
    restoreImage(undodata[undopointer]);
  }
}
function redo() {
  if (undopointer < undodata.length) {
    undopointer++;
    if (undopointer == undodata.length) {
      restoreImage(undocurrent);
    } else {
      restoreImage(undodata[undopointer]);
    }
  }
}
function saveHistory() {
  undodata[undopointer] = serializeImage();
  undopointer++;
  // remove redo steps beyond this state
  undodata.splice(undopointer);
}

// zoom factor
var zoom;
function setZoom(z)
{
  if (zoom !== z && z >= 0) {
    zoom = z;
    canvas.width = backbuffer.width * (1 << zoom);
    canvas.height = backbuffer.height * (1 << zoom);
    updateFrontBuffer();
  }
}

// debug events
var dspan = document.getElementById("debug");
var dspan2 = document.getElementById("debug2");
var estat = {};
function filterHostObject(e)
{
  var o = {}, t, a, i, key;

  if (e === null || e === undefined)
    return e;

  for (key in e) {
    if (e[key] instanceof Node) {
      o[key] = '((Node))';
    }
    else if (e[key] instanceof Window) {
      o[key] = '((Window))';
    }
    else if (e[key] instanceof Function) {
      o[key] = '((Function))';
    }
    else {
      t = typeof e[key];
      if (t === 'number' || t === 'string' || t === 'boolean' ) {
        o[key] = e[key];
      }
      else if (t === 'object') {
        o[key] = filterHostObject(e[key]);
      }
      else if (t === 'array') {
        o[key] = [];
        a = filterHostObject(e[key]);
        for (i in a)
          o[i] = a[i];
      }
      else {
        o[key] = '(' + t + ')';
      }
    }
  }
  return o;
}

function printEvent(e)
{
  //dspan.innerText = JSON.stringify(filterHostObject(e), (k,v) => {return v;}, ' ');
  console.log(JSON.stringify(filterHostObject(e), (k,v) => {return v;}, ' '));

  var n = estat[e.type] || 0;
  estat[e.type] = n + 1;

  //dspan2.innerText = JSON.stringify(estat, (k,v) => {return v;}, ' ');
  console.log(JSON.stringify(estat, (k,v) => {return v;}, ' '));
}

// pixel coordinates and button state used last
var px, py, button_old;

// current tool
var tool = 0;

// dragging the mouse?
var dragging = false;

// block list to restore
var restore = [];
function saveBlock(px, py) {
  restore.push({x: (px >> 3), y: (py >> 3)});
}
function restoreBlocks()
{
  var i;
  for (i = 0; i < restore.length; ++i)
    drawBlock(restore[i].x, restore[i].y, image[restore[i].x + restore[i].y * nbx]);
  restore = [];
}

// toolbar and hotkeys
var commands = [
  ['d',  0, () => { tool = (tool + 1) % 2; }],
  ['D', null, () => { dithering = !dithering; }],
  ['s',  6, () => {
    restoreBlocks();
    var link = document.createElement('a');
    link.href = backbuffer.toDataURL("image/png");
    link.download = 'untitled.png';
    link.click();
  }],
  ['C',  1, () => { saveHistory(); clear(); redraw(); }],
  ['u',  2, () => { undo(); redraw(); }],
  ['U',  7, () => {
    var input = document.createElement('input');
    input.type = "file";
    input.addEventListener('change', (e) => { fileUploadHandler(e, input.files); });
    input.click();
  }],
  ['y',  3, () => { redo(); redraw(); }],
  ['b',  4, () => { minimal_pixel_change = !minimal_pixel_change; toolbar.pressed[4] = minimal_pixel_change; } ],
  ['p',  8, () => {
    if (palette === murky_palette)
      palette = lively_palette;
    else
      palette = murky_palette;
    redraw();
    toolbar.draw();
  }],
  ['f',  /*9*/ null, () => {
    // go fullscreen
    var c = document.getElementById('container');
    var r = c.requestFullscreen || c.webkitRequestFullscreen || c.mozRequestFullscreen || null;
    if (r) r();
  }],
  ['g', 12, () => { grid = !grid; updateFrontBuffer(); toolbar.pressed[12] = grid; }],
  ['R', null, () => { saveHistory(); randomize(); redraw(); }],
  ['+', 10, () => { setZoom(zoom + 1); }],
  ['-', 11, () => { setZoom(zoom - 1); }]
];

// add keyboard event listener
document.addEventListener('keydown', (e) => {
  if (e.keyCode >= 48 && e.keyCode < 56) {
    fg = e.keyCode - 48;
    if (e.shiftKey)
      fg += 8;
    toolbar.draw();
    return;
  }

  var i;
  for (i = 0; i < commands.length; ++i)
    if (e.key === commands[i][0]) {
      commands[i][2]();
      return;
    }
});

function touchOrHover(x, y, button)
{
  var pxn = Math.floor(x / (1 << zoom)) - 1;
  var pyn = Math.floor(y / (1 << zoom)) - 1;

  // mouse has not moved
  if (button === button_old && pxn === px && pyn === py)
    return;

  // out of bounds
  if (pxn < 0 || pyn < 0 || pxn >= nbx*8 || pyn >= nby*8)
    return;

  px = pxn;
  py = pyn;
  button_old = button;

  if (tool === 0) { // pixel draw
    if (button === 0) { // preview
      restoreBlocks();
      saveBlock(px, py);
      setPixel(px, py, fg, false);
      updateFrontBuffer();
    }
    else if (button === 1) { // fg
      setPixel(px, py, fg, true);
      updateFrontBuffer();
    }
    else if (button === 2) { // bg
      setPixel(px, py, bg, true);
      updateFrontBuffer();
    }
  }
  else if (tool === 1) { // block draw
    if (button === 0) { // preview
      restoreBlocks();
      saveBlock(px, py);
      fillBlock(px, py, fg, false);
      updateFrontBuffer();
    }
    else if (button === 1) { // fg
      fillBlock(px, py, fg, true);
      updateFrontBuffer();
    }
    else if (button === 2) { // bg
      fillBlock(px, py, bg, true);
      updateFrontBuffer();
    }
  }
}

// process mouse event
function processMouseEvent(e)
{
  touchOrHover(e.offsetX, e.offsetY, e.buttons);
  e.preventDefault();
  e.stopPropagation();
}

// check if the event is caused by an S-Pen touch
function isSPen(e)
{
  return (
    e.targetTouches &&
    e.targetTouches.length === 1 &&
    e.targetTouches[0].radiusX === 0 &&
    e.targetTouches[0].radiusY === 0
  );
}

// process mouse event
function processTouchEvent(e)
{
  var tt = e.targetTouches;
  //dspan2.innerText = 'pte ';
  if (isSPen(e)) {
    // pen draws with FG
    touchOrHover(tt[0].pageX + viewport.scrollLeft, tt[0].pageY + viewport.scrollTop, 1);
    e.preventDefault();
    e.stopPropagation();
  }
}

// add mouse listeners
canvas.addEventListener('touchmove', (e) => {
  processTouchEvent(e);
});
canvas.addEventListener('touchstart', (e) => {
  //printEvent(e);
  if (isSPen(e)) {
    saveHistory();
  }
  processTouchEvent(e);
});
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  e.stopPropagation();
});
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  saveHistory();
  processMouseEvent(e);
});
canvas.addEventListener('mousemove', (e) => {
  processMouseEvent(e);
});
document.addEventListener('mouseup', (e) => {
  dragging = false;
  e.preventDefault();
  e.stopPropagation();
});
canvas.addEventListener('contextmenu', function(evt) {
  evt.preventDefault();
}, false);

// add system events
window.addEventListener('beforeunload', (e) => {
  window.localStorage.setItem('current_image', serializeImage());
});

// toolbar
class Toolbar
{
  constructor(id) {
    // list of currently active toolbar icons
    this.icons = [];
    this.pressed = [];

    // click handler
    this.handler = null;

    // toolbar icon grid
    this.ii = 2;
    this.jj = 7;

    this.element = document.getElementById(id);
    this.ctx = this.element.getContext('2d');

    // back buffer for drawing the toolbar icons
    this.backbuffer = document.createElement('canvas');
    this.backbuffer.width = this.ii * 18;
    this.backbuffer.height = this.jj * 18;
    this.backctx = this.backbuffer.getContext('2d');

    window.addEventListener('resize', (e) => {
      this.draw();
    });

    // mouse
    this.element.addEventListener('mousedown', (e) => { this.handleMouseEvent(e); });
    this.element.addEventListener('mouseup', (e) => { this.handleMouseEvent(e); });

    // touches
    this.activetouches = [];
    this.element.addEventListener('touchstart', (e) => { this.handleTouchEvent(e); });
    this.element.addEventListener('touchend', (e) => { this.handleTouchEvent(e); });

    // spritesheet for the tool bar icons
    this.img = new Image();
    this.img.onload = (e) => { this.draw(); };
    this.img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAEAAQMAAACAnGQNAAAABlBMVEUaJTGAgIBxkqdpAAABPUlEQVQoz62SMU7DMBiFn9QDcJQegCFH4AAMjIwcwWwMDByhR2BkYAiCoQODkUCKhIgMikSGqHUrB4UoSc37SaiS0jIhPVnvf//n37EceI9WZQBnkFrYAtbD0hjYEAW7Go3CmqSKFMkdnEY5QR2gVrLSM0lTpO0EP9jS8AiPPIDVMAQq5Pso79E4+GpAdgrhOXwM9w1zy8sYjxPoEOYX/BrI1+Yn+LiUtfjxbckWgT6/UlheYHYll30/RnwtomHJkK2V2jziZiQrr9mEnd7OUFhURvwunjm7ZEiSX++tN75nD8sI83M8HeK2QsT7OsQazyFmfAKFz+HwaQLtEGUyuZ+zZMgWgX5uKmSRvE4yHeQsGbJlhk+wUPL0sRE9HHWGyeIAPoLP4N0W3hgR+db8wc+t6HTUmV1+y1/xz/oCaavHSFEtAnoAAAAASUVORK5CYII=';
  }

  setIcons(icons) {
    this.icons = icons;
    this.pressed = new Array(this.icons.length);
    this.deactivated = new Array(this.icons.length);
  }

  setHandler(handler) {
    this.handler = handler;
  }

  iconAt(x,y) {
    var b = this.element.width / this.ii;
    var cx = Math.floor(x / b);
    var cy = Math.floor(y / b);
    if (cx >= 0 && cx <= this.ii && cy >= 0 && cy <= this.jj) {
      var c = cx + cy * this.ii;
      if (c < this.icons.length)
        return c;
    }
    return undefined;
  }

  colorAt(x,y) {
    var bw = this.element.width >> 1; // w/2
    var bh = this.element.height >> 4; // h/16
    var cx = Math.floor(x / bw);
    var cy = Math.floor(y / bh - 8);
    if (cx >= 0 && cx <= 1 && cy >= 0 && cy <= 7) {
      return cx * 8 + cy;
    }
    return undefined;
  }

  handleMouseEvent(e) {
    // check palette
    var color = this.colorAt(e.offsetX, e.offsetY);
    if (color !== undefined) {
      if (e.buttons === 1)
        fg = color;
      if (e.buttons === 2)
        bg = color;
      this.draw();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // check toolbar icons
    var icon = this.iconAt(e.offsetX, e.offsetY);
    if (icon !== undefined && !this.deactivated[icon]) {
      if (e.type === 'mousedown') {
        this.pressed[icon] = true;
        this.draw();
      } else if (e.type === 'mouseup') {
        this.pressed[icon] = false;
        if (this.handler)
          this.handler(icon);
        this.draw();
      }
    }
  }

  handleTouchEvent(e) {
    var i, j, x, y, c;
    var at = this.activetouches;
    var ct = e.changedTouches;
    var rect = this.element.getBoundingClientRect();

    e.stopPropagation();
    e.preventDefault();

    // start touch
    if (e.type === 'touchstart') {
      if (at.length === 0) {
        ct = e.changedTouches;
        for (i = 0; i < ct.length; ++i) {
          x = ct[i].clientX - rect.left;
          y = ct[i].clientY - rect.top;
          // color?
          c = this.colorAt(x,y);
          if (c !== undefined) {
            fg = c;
            this.draw();
            return;
          }

          // icon?
          c = this.iconAt(x,y);
          if (c !== undefined && !this.deactivated[c]) {
            at.push({'id': ct[i].identifier, 'icon': c});
            this.pressed[c] = true;
          }
        }
        this.draw();
      }
    }

    // end touch
    else if (e.type === 'touchend') {
      // loop over lifted touches
      for (j = 0; j < ct.length; ++j) {
        // loop recorded active touches that started on icons
        for (i = 0; i < at.length; ++i) {
          // check if any of the lifted touch matches active touch
          if (ct[j].identifier === at[i].id) {
            // remove active touch
            this.pressed[at[i].icon] = false;
            if (this.handler) {
              this.handler(at[i].icon);
            }
            at.splice(i, 1);
            break;
          }
        }
      }
      this.draw();
    }
  }

  color(i) {
    return 'rgb(' + palette[i].red + ',' + palette[i].green + ',' + palette[i].blue + ')';
  }

  draw() {
    var i, j, c;
    var w = this.element.offsetWidth, h = this.element.offsetHeight;
    var bw = w >> 1; // w/2
    var bh = h >> 4; // h/16
    var fw = bw >> 4;
    var fh = bh >> 4;
    this.element.width = w;
    this.element.height = h;

    // insert color swaths
    for (i = 0; i < 2; ++i)
      for (j = 0; j < 8; ++j) {
        c = i * 8 + j;
        if (fg != c && bg != c) {
          this.ctx.fillStyle = this.color(c);
          this.ctx.fillRect(i*bw, (j+8)*bh, bw, bh);
        } else {
          if (fg == c && bg == c) {
            this.ctx.fillStyle = '#777';
          } else if (fg == c) {
            this.ctx.fillStyle = '#ddd';
          } else {
            this.ctx.fillStyle = '#111';
          }
          this.ctx.fillRect(i*bw, (j+8)*bh, bw, bh);
          this.ctx.fillStyle = this.color(c);
          this.ctx.fillRect(i*bw + fw, (j+8)*bh + fh, bw - 2* fw, bh - 2*fh);
        }
      }

    // draw icons
    var ctx = this.backctx;
    ctx.beginPath();
    ctx.clearRect(0, 0, this.ii*18, this.jj*18);
    for (i = 0; i < this.ii; ++i)
      for (j = 0; j < this.jj; ++j) {
        c = i + j * this.ii;
        if (c >= this.icons.length) continue;
        // background
        ctx.fillStyle = '#777';
        ctx.fillRect(i*18, j*18, 18, 18);
        // highlight
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(i*18 + 0.5, j*18 + 16.5);
        ctx.lineTo(i*18 + 0.5, j*18 + 0.5);
        ctx.lineTo(i*18 + 16.5, j*18 + 0.5);
        if (this.pressed[c])
          ctx.strokeStyle = '#444';
        else
          ctx.strokeStyle = '#aaa';
        ctx.stroke();
        // shadow
        ctx.beginPath();
        ctx.moveTo(i*18 + 1.5, j*18 + 17.5);
        ctx.lineTo(i*18 + 17.5, j*18 + 17.5);
        ctx.lineTo(i*18 + 17.5, j*18 + 1.5);
        if (this.pressed[c])
          ctx.strokeStyle = '#aaa';
        else
          ctx.strokeStyle = '#444';
        ctx.stroke();
        // insert icon
        ctx.drawImage(this.img, 0, this.icons[c] * 16, 16, 16, i*18 + 1, j * 18 + 1, 16, 16);
        // gray out if deactivated
        if (this.deactivated[c]) {
          ctx.fillStyle = 'rgba(127, 127, 127, 0.5)';
          ctx.fillRect(i*18, j*18, 18, 18);
        }
      }
    var sh = Math.floor((w*this.jj)/this.ii);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.backbuffer, 0, 0, this.ii*18, this.jj*18, 0, 0, w, sh);
  }
}

// instantiate Toolbar on canvas#toolbar
var toolbar = new Toolbar('toolbar');
toolbar.setIcons([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13]);
toolbar.setHandler((c) => {
  for (i = 0; i < commands.length; ++i)
    if (c === commands[i][1]) {
      commands[i][2]();
      return;
    }
});
toolbar.pressed[4] = minimal_pixel_change;
toolbar.pressed[12] = grid;
toolbar.deactivated[5] = true;
toolbar.deactivated[9] = true;
toolbar.draw();

// import image
function importImage(img)
{
  // image is loaded, copy it to a canvas to resize and process
  var importcanvas = document.createElement("canvas");
  importcanvas.width = backbuffer.width;
  importcanvas.height = backbuffer.height;
  var importctx = importcanvas.getContext('2d');
  var rx = img.width / importcanvas.width, ry = img.height / importcanvas.height;
  // shrink to canvas preseving aspect ratio, but never enlarge
  var rr = Math.max(1.0, Math.max(rx, ry));

  // scaled width and height, copy image to import canvas
  var sw = Math.floor(img.width / rr), sh = Math.floor(img.height / rr);
  importctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, sw, sh);

  // set up datastructures
  var dist = new Int32Array(new ArrayBuffer(4 * 16 * 64));
  var bx, ibx = Math.ceil(sw / 8);
  var by, iby = Math.ceil(sh / 8);

  // loop over blocks and color reduce
  var buf;
  for (bx = 0; bx < ibx; ++bx)
    for (by = 0; by < iby; ++by)
    {
      // get image data for current block
      buf = importctx.getImageData(bx * 8 , by * 8, 8, 8);

      // build distance table for all 16 commodore palette entries and 64 pixels in the current block
      var px, col, i = 0;
      for (col = 0; col < 16; ++col)
      {
        var r = palette[col].red;
        var g = palette[col].green;
        var b = palette[col].blue;
        for (px = 0; px < 64; ++px)
          dist[i++] = (buf.data[px*4]-r)*(buf.data[px*4]-r) +
                      (buf.data[px*4+1]-g)*(buf.data[px*4+1]-g) +
                      (buf.data[px*4+2]-b)*(buf.data[px*4+2]-b);
      }

      // find 2-color combination with minimum distance square sum
      var other_color_factor = 0.01;
      var sum, msum = null, match, c1, c2;
      for (c1 = 1; c1 < 16; ++c1)
        for (c2 = 0; c2 < c1; ++c2)
        {
          // generate metric
          sum = 0;
          for (px = 0; px < 64; ++px) {
            sum += Math.min(dist[c1*64+px], dist[c2*64+px]);
            // if we are dithering we mix in the disregarded distance as well
            if (dithering)
              sum += other_color_factor * Math.max(dist[c1*64+px], dist[c2*64+px]);
          }
          if (msum === null || sum < msum) {
            msum = sum;
            match = [c1, c2, msum];
          }
        }

      // distance between the two matched colors (needed for dithering)
      var r0 = palette[match[0]].red;
      var g0 = palette[match[0]].green;
      var b0 = palette[match[0]].blue;
      var r1 = palette[match[1]].red;
      var g1 = palette[match[1]].green;
      var b1 = palette[match[1]].blue;
      var dmatch = (r1-r0)*(r1-r0) + (g1-g0)*(g1-g0) + (b1-b0)*(b1-b0);

      // loop over block and raster it
      var x, y, bl = image[bx + by * nbx];
      px = 0;
      for (y = 0; y < 8; ++y) {
        bl.pix[y] = 0;
        for (x = 0; x < 8; ++x) {
          bl.pix[y] <<= 1;
          var d0 = dist[match[0]*64+px];
          var d1 = dist[match[1]*64+px];
          if (!dithering || d0 > dmatch || d1 > dmatch) {
            // no dithering
            if (d0 < d1)
              bl.pix[y]++;
          } else {
            // random dithering
            if (Math.random() * (d0 + d1) > d0)
              bl.pix[y]++;
          }
          px++;
        }
      }
      bl.fg = match[0];
      bl.bg = match[1];
    }
  redraw();
}

function fileUploadHandler(e, targetFiles) {
  e.stopPropagation();
  e.preventDefault();

  printEvent(e);

  var files = targetFiles || e.dataTransfer.files;
  if (files.length > 1) {
    alert("Drop one file at a time.");
    return;
  }

  var file = files[0];
  if (!file.type.match('image.*')) {
    alert("Drop an image file for importing.");
    return;
  }

  var img = new Image();
  img.onload = () => { importImage(img); };

  var reader = new FileReader();
  reader.onload = (e) => { img.src = e.target.result; };
  reader.readAsDataURL(file);
}

// Setup the dnd listeners.
canvas.addEventListener('dragover', (e) => {
  e.stopPropagation();
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
canvas.addEventListener('drop', fileUploadHandler);

// set viewport
setZoom(2);
redraw();
