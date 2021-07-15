// color mode. If this is true setting a third color will recolor the block so that
// the smallest number of pixels is changed, otherwise it will recolor all pixels
// with the same coloer as the pixel underneath the pointer (MultiPaint default))
var minimal_pixel_change = false;

// import using dithering? (0=none, 1=random, 2=floyd-steinberg)
var dithering = 0;

// sprite masked 3 color mode
var sprite_mask = false;
var mask_color = 0;

// block data
class Block {
  constructor(copy) {
    if (copy) {
      this.fg = copy.fg;
      this.bg = copy.bg;
      this.pix = Array.apply(null, Array(8)).map((x,i) => {return copy.pix[i];});
      this.mask = Array.apply(null, Array(8)).map((x,i) => {return copy.mask[i];});
    } else {
      this.fg = 1;
      this.bg = 0;
      this.pix = Array.apply(null, Array(8)).map(() => {return 0;});
      this.mask = Array.apply(null, Array(8)).map(() => {return 0;});
    }
  }

  clear() {
    this.fg = 1;
    this.bg = 0;
    this.pix.fill(0);
    this.mask.fill(0);
  }

  fillBlock(color) {
    this.clear();
    this.bg = color;
  }

  random() {
    this.fg = Math.floor(Math.random() * 16);
    this.bg = Math.floor(Math.random() * 16);
    this.pix = Array.apply(null, Array(8)).map(() => {return Math.floor(Math.random() * 256);});
    this.mask.fill(0);
  }

  getPixel(x, y) {
    if (sprite_mask)
    {
      if (this.mask[y] & (1 << (7-x)))
        return mask_color;
    }

    var is_set = this.pix[y] & (1 << (7-x));
    if (is_set)
      return this.fg;
    return this.bg;
  }

  setPixel(x, y, color) {
    if (sprite_mask)
    {
      var mask_set = this.mask[y] & (1 << (7-x));
      if (color == mask_color)
      {
        if (!mask_set)
          this.mask[y] += (1 << (7-x));
        return;
      }
      if (color != mask_color && mask_set)
        this.mask[y] -= (1 << (7-x));

      // fg or bg are the same as the sprite mask. Make them available
      if (this.fg == mask_color)
      {
        // bitwise or mask with pix
        for (let byte = 0; byte < 8; ++byte)
          this.mask[byte] |= this.pix[byte];
        this.fg = color;
      }
      else if (this.bg == mask_color)
      {
        // bitwise or mask with ~pix
        for (let byte = 0; byte < 8; ++byte)
          this.mask[byte] |= (~this.pix[byte] & 0xff);
        this.bg = color;
      }
    }

    var is_set = this.pix[y] & (1 << (7-x));

    // no color change necessary
    if (this.fg == color) {
      if (!is_set && this.bg != color)
        this.pix[y] += (1 << (7-x));
      return;
    }
    if (this.bg == color) {
      if (is_set && this.fg != color)
        this.pix[y] -= (1 << (7-x));
      return;
    }

    // count number of set pixels in the current block
    let fsum = 0, bsum = 0;
    for (let byte = 0; byte < 8; ++byte)
    {
      fsum += Block.bitcount[this.pix[byte] & ~this.mask[byte]];
      bsum += 8 - Block.bitcount[this.pix[byte] & this.mask[byte]];
    }

    if (fsum == 0) {
      // block has no pixels set, we are free to reset the foreground color
      this.fg = color;
      this.pix[y] += (1 << (7-x));
    }
    else if (bsum == 0 && this.fg != color) {
      // block has all pixels set, we are free to reset the background color
      this.bg = color;
      this.pix[y] -= (1 << (7-x));
    }
    else {
      // some pixels are set, some are not. Proceed depending on the color change model
      if (minimal_pixel_change) {
        // try to set with recoloring as few pixels as possible
        if (fsum < bsum) {
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
  var idx = 0, col;
  for (let byte = 0; byte < 8; ++byte)
    for (let bit = 7; bit >= 0; --bit)
    {
      var mask_set = block.mask[byte] & (1 << bit);
      if (sprite_mask && mask_set)
      {
        col = mask_color;
      }
      else
      {
        is_set = block.pix[byte] & (1 << bit);
        if (is_set)
          col = block.fg;
        else
          col = block.bg;
      }
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
    frontctx.imageSmoothingEnabled = true;
    frontctx.lineWidth = 0.5;
    for (let bx = 0; bx <= nbx; ++bx) {
      frontctx.beginPath();
      frontctx.moveTo(bx * space, 0);
      frontctx.lineTo(bx * space, (nbx+1) * space);
      frontctx.strokeStyle = 'white';
      frontctx.stroke();
      frontctx.strokeStyle = 'black';
      frontctx.stroke();
    }
    for (let by = 0; by <= nbx; ++by) {
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
  for (let by = 0; by < nby; ++by)
    for (let bx = 0; bx < nbx; ++bx)
      image[bx + by * nbx].clear();
}

function flipHorizontal()
{
  for (let by = 0; by < nby; ++by) {
    // swap blocks
    for (let bx = 0; bx < Math.floor(nbx/2); ++bx) {
      let tmp = image[bx + by * nbx];
      image[bx + by * nbx] = image[(nbx - 1 - bx)  + by * nbx];
      image[(nbx - 1 - bx)  + by * nbx] = tmp;
    }

    // flip bits
    for (let bx = 0; bx < nbx; ++bx) {
      for (let i = 0; i < 8; ++i) {
        let b = image[bx + by * nbx].pix[i], c = 0;
        for (let i = 0; i < 8; ++i) {
          c <<= 1;
          c += b & 1;
          b >>= 1;
        }
        image[bx + by * nbx].pix[i] = c;
      }
    }
  }
}

function flipVertical()
{
  for (let bx = 0; bx < nbx; ++bx) {
    // swap blocks
    for (let by = 0; by < Math.floor(nby/2); ++by) {
      let tmp = image[bx + by * nbx];
      image[bx + by * nbx] = image[bx + (nby - 1 - by) * nbx];
      image[bx + (nby - 1 - by) * nbx] = tmp;
    }

    // flip bytes in block
    for (let by = 0; by < nby; ++by) {
      let p = image[bx + by * nbx].pix;
      for (let i = 0; i < 4; ++i) {
        let tmp = p[i];
        p[i] = p[7-i];
        p[7-i] = tmp;
      }
    }
  }
}

// randomize image
function randomize()
{
  for (let by = 0; by < nby; ++by)
    for (let bx = 0; bx < nbx; ++bx)
      image[bx + by * nbx].random();
}

// redraw image
function redraw()
{
  for (let by = 0; by < nby; ++by)
    for (let bx = 0; bx < nbx; ++bx)
      drawBlock(bx, by, image[bx + by * nbx]);
  updateFrontBuffer();
}

// set a pixel at given coordinates using an block object
function fillBlock(px, py, color, draw) {
  var bx = px >> 3, by = py >> 3;
  var index = bx + by * nbx;
  var block;
  if (draw) {
    block = image[bx + by * nbx];
  } else {
    if (!restore.has(index)) {
      restore.set(index, [bx, by, new Block(image[index])]);
    }
    block = restore.get(index)[2];
  }
  block.fillBlock(color);
  drawBlock(bx, by, block);
}

// set a pixel at given coordinates using an block object
function setPixel(px, py, color, draw) {
  // ot of bounds 1
  if (px < 0 || py < 0) return;

  var bx = px >> 3, by = py >> 3;

  // out of bounds 2
  if (bx >= nbx || by >= nby) return;

  var index = bx + by * nbx;
  var block;
  if (draw) {
    block = image[index];
  } else {
    if (!restore.has(index)) {
      restore.set(index, [bx, by, new Block(image[index])]);
    }
    block = restore.get(index)[2];
  }
  block.setPixel(px % 8, py % 8, color);
  drawBlock(bx, by, block);
}

// draw a line (http://members.chello.at/easyfilter/bresenham.html)
function drawLine(x0, y0, x1, y1, color, draw) {
  let dx =  Math.abs(x1 - x0), sx = (x0 < x1) * 2 - 1;
  let dy = -Math.abs(y1 - y0), sy = (y0 < y1) * 2 - 1;
  let err = dx + dy, e2;

  while (true) {
    setPixel(x0, y0, color, draw);
    if (x0 == x1 && y0 == y1) break;
    e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// draw a circle (http://members.chello.at/easyfilter/bresenham.html)
function drawCircle(xm, ym, xc, yc, color, draw)
{
  let r = Math.floor(Math.sqrt((xm-xc)*(xm-xc)+(ym-yc)*(ym-yc)))
  let x = -r, y = 0, err = 2-2*r; /* II. Quadrant */
  do {
    setPixel(xm-x, ym+y, color, draw); /*   I. Quadrant */
    setPixel(xm-y, ym-x, color, draw); /*  II. Quadrant */
    setPixel(xm+x, ym-y, color, draw); /* III. Quadrant */
    setPixel(xm+y, ym+x, color, draw); /*  IV. Quadrant */
    r = err;
    if (r <= y) err += ++y*2+1;           /* e_xy+e_y < 0 */
    if (r > x || err > y) err += ++x*2+1; /* e_xy+e_x > 0 or no 2nd y-step */
  } while (x < 0);
}

// draw a filled circle
function drawFilledCircle(xm, ym, xc, yc, color, draw)
{
  let r = Math.ceil(Math.sqrt((xm-xc)*(xm-xc)+(ym-yc)*(ym-yc)));
  for (let y = -r; y <= r; ++y) {
    let xx = Math.round(Math.sqrt(r*r - y*y));
    for (let x = -xx; x <= xx; ++x)
      setPixel(x + xm, y + ym, color, draw);
  }
}

// draw an ellipse (http://members.chello.at/easyfilter/bresenham.html)
function drawEllipseRect(x0, y0, x1, y1, color, draw)
{
  let a = Math.abs(x1-x0), b = Math.abs(y1-y0), b1 = b % 2; /* values of diameter */
  let dx = 4*(1-a)*b*b, dy = 4*(b1+1)*a*a; /* error increment */
  let err = dx+dy+b1*a*a, e2; /* error of 1.step */

  if (x0 > x1) { x0 = x1; x1 += a; } /* if called with swapped points */
  if (y0 > y1) y0 = y1; /* .. exchange them */
  y0 += (b+1)/2; y1 = y0-b1;   /* starting pixel */
  a *= 8*a; b1 = 8*b*b;

  do {
    setPixel(x1, y0, color, draw); /*   I. Quadrant */
    setPixel(x0, y0, color, draw); /*  II. Quadrant */
    setPixel(x0, y1, color, draw); /* III. Quadrant */
    setPixel(x1, y1, color, draw); /*  IV. Quadrant */
    e2 = 2*err;
    if (e2 <= dy) { y0++; y1--; err += dy += a; }  /* y step */
    if (e2 >= dx || 2*err > dy) { x0++; x1--; err += dx += b1; } /* x step */
  } while (x0 <= x1);

  while (y0-y1 < b) {  /* too early stop of flat ellipses a=1 */
    setPixel(x0-1, y0, color, draw); /* -> finish tip of ellipse */
    setPixel(x1+1, y0++, color, draw);
    setPixel(x0-1, y1, color, draw);
    setPixel(x1+1, y1--, color, draw);
  }
}

// serialize image for exporting and emergency save
function serializeImage()
{
  var blocks = nbx * nby;
  var size =  blocks * (1+8+8) + 2;
  buf = new Uint8Array(new ArrayBuffer(size));
  // header (width and height)
  buf[0] = nbx;
  buf[1] = nby;

  // serialize fg/bg data
  for (let i = 0; i < blocks; ++i)
    buf[i+2] = image[i].fg + (image[i].bg << 4);

  // serialize bitmap data
  for (let i = 0; i < blocks; ++i)
    for (let j = 0; j < 8; ++j)
      buf[i*8+j+blocks+2] = image[i].pix[j];

  // serialize mask data
  for (let i = 0; i < blocks; ++i)
    for (let j = 0; j < 8; ++j)
      buf[i*8+j+blocks*9+2] = image[i].mask[j];

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

  var blocks = nbx * nby;
  var size =  blocks * (1+8+8) + 2;
  if (buf.length != size) {
    alert("Corrupt image data");
  }
  image = Array.apply(null, Array(blocks)).map(() => {return new Block();});

  // unserialize fg/bg data
  for (let i = 0; i < blocks; ++i) {
    image[i].fg = buf[i+2] % 16;
    image[i].bg = buf[i+2] >> 4;
  }

  // unserialize bitmap data
  for (let i = 0; i < blocks; ++i)
    for (let j = 0; j < 8; ++j)
      image[i].pix[j] = buf[i*8+j+blocks+2];

  // unserialize mask data
  for (let i = 0; i < blocks; ++i)
    for (let j = 0; j < 8; ++j)
      image[i].mask[j] = buf[i*8+j+blocks*9+2];
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
  var o = {};

  if (e === null || e === undefined)
    return e;

  for (let key in e) {
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
      let t = typeof e[key];
      if (t === 'number' || t === 'string' || t === 'boolean' ) {
        o[key] = e[key];
      }
      else if (t === 'object') {
        o[key] = filterHostObject(e[key]);
      }
      else if (t === 'array') {
        o[key] = [];
        let a = filterHostObject(e[key]);
        for (let i in a)
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

// drag start pixel coords
var dpx, dpy;

// block list to restore
var restore = new Map();
function restoreBlocks()
{
  for (let [index, coord] of restore)
    drawBlock(coord[0], coord[1], image[index]);
  restore.clear();
}

// toolbar and hotkeys
var commands = [
  ['d',  0, () => {
    tool = (tool + 1) % 4;
    toolbar.icons[0] = toolicons[tool];
    toolbar.draw();
  }],
  ['D', null, () => { dithering = (dithering + 1) % 2; }],
  ['h', null, () => {
    restoreBlocks();
    saveHistory();
    flipHorizontal();
    redraw();
  }],
  ['v', null, () => {
    restoreBlocks();
    saveHistory();
    flipVertical();
    redraw();
  }],
  ['H',  5, () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt = undefined;
      toolbar.deactivated[5] = true;
      toolbar.draw();
    }
  }],
  ['s',  6, () => {
    restoreBlocks();
    var link = document.createElement('a');
    link.href = backbuffer.toDataURL("image/png");
    link.download = 'untitled.png';
    link.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}));
  }],
  ['C',  1, () => {
    restoreBlocks();
    saveHistory();
    clear();
    redraw();
  }],
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
  ['f',  9, () => { fullscreen.toggle(); }],
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

  for (let i = 0; i < commands.length; ++i)
    if (e.key === commands[i][0]) {
      commands[i][2]();
      window.localStorage.setItem('current_image', serializeImage());
      return;
    }
});

function touchOrHover(x, y, button)
{
  var pxn = Math.floor((x - 1) / (1 << zoom));
  var pyn = Math.floor((y - 1)/ (1 << zoom));

  // mouse has not moved
  if (button === button_old && pxn === px && pyn === py)
    return;

  // out of bounds
  if (pxn < 0 || pyn < 0 || pxn >= nbx*8 || pyn >= nby*8)
    return;

  px = pxn;
  py = pyn;

  if (tool === 0) { // pixel draw
    if (button === 0) { // preview
      restoreBlocks();
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
  else if (tool === 2) { // line
    if (button === 0) {
      if (dragging) {
        drawLine(dpx, dpy, px, py, fg, true);
        updateFrontBuffer();
        dragging = false;
      } else {
        restoreBlocks();
        setPixel(px, py, fg, false);
        updateFrontBuffer();
      }
    } else if (button === 1) {
      if (dragging) {
        restoreBlocks();
        drawLine(dpx, dpy, px, py, fg, false);
        updateFrontBuffer();
      } else {
        dpx = px;
        dpy = py;
        dragging = true;
      }
    }
  }
  else if (tool === 3) { // circle
    if (button === 0) {
      if (dragging) {
        drawCircle(dpx, dpy, px, py, fg, true);
        // drawFilledCircle(dpx, dpy, px, py, fg, true);
        // drawEllipseRect(dpx, dpy, px, py, fg, true);
        updateFrontBuffer();
        dragging = false;
      } else {
        restoreBlocks();
        setPixel(px, py, fg, false);
        updateFrontBuffer();
      }
    } else if (button === 1) {
      if (dragging) {
        restoreBlocks();
        drawCircle(dpx, dpy, px, py, fg, false);
        // drawFilledCircle(dpx, dpy, px, py, fg, false);
        // drawEllipseRect(dpx, dpy, px, py, fg, false);
        updateFrontBuffer();
      } else {
        dpx = px;
        dpy = py;
        dragging = true;
      }
    }
  }

  button_old = button;
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
  window.localStorage.setItem('current_image', serializeImage());
});
canvas.addEventListener('mousedown', (e) => {
  saveHistory();
  processMouseEvent(e);
});
canvas.addEventListener('mousemove', (e) => {
  processMouseEvent(e);
});
document.addEventListener('mouseup', (e) => {
  processMouseEvent(e);
  window.localStorage.setItem('current_image', serializeImage());
});
canvas.addEventListener('contextmenu', function(evt) {
  evt.preventDefault();
}, false);

// add system events
window.addEventListener('beforeunload', (e) => {
  window.localStorage.setItem('current_image', serializeImage());
});

// add to homescreen code
let deferredPrompt = undefined;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  toolbar.deactivated[5] = false;
  toolbar.draw();
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
    this.img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAEgAQMAAACHMGE7AAAABlBMVEUaJTGAgIBxkqdpAAABb0lEQVQoz32TMU7DMBiFn9QDcASO0AMw5AiMDAyMjBzBbAwMHKFHYGRgSAVDB4YgAYqEqAyKRIaqdasUuVWamvcnbpSUFumT9fz+Zzv2r8A5VCwDZBqpgbEwDoZCw4SwrEYoFOoksSmSR2QRlj2sAqyUjNR00hRptYNrLSl4hMM8gImgGcgxP8LyCUUGl7eSnhCOm3eRlWEu+ejipYcohP4T/gzka+cX+LmV0W50NWWJgWZ+rTC7wfhOLvt9juG9QMEpTZbWavuIfkdGXrMIPV9XsAa5Fr0vT59VZphkvl672vqeA8xiTK7xeoqHHDHvm2EY4T3EmC1QWLQ3HySIMsQj2bnpc0qTJQaavs4xiqU7yaDlc0qTJd1uwVRJ64daeD7zgs70GC6GG8FlO/JaC8xX4p/8xAiXHS/26Tq/OPTwXhV951kkntb765KwRAlrJxQleUkz/3ZSvpLdPVbVJmwf303+FCtPV1M5LG36+wsC3PsxbqaO3AAAAABJRU5ErkJggg==';
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
    var x, y, c;
    var at = this.activetouches;
    var ct = e.changedTouches;
    var rect = this.element.getBoundingClientRect();

    e.stopPropagation();
    e.preventDefault();

    // start touch
    if (e.type === 'touchstart') {
      if (at.length === 0) {
        ct = e.changedTouches;
        for (let i = 0; i < ct.length; ++i) {
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
      for (let j = 0; j < ct.length; ++j) {
        // loop recorded active touches that started on icons
        for (let i = 0; i < at.length; ++i) {
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
    var c;
    var w = this.element.offsetWidth, h = this.element.offsetHeight;
    var bw = w >> 1; // w/2
    var bh = h >> 4; // h/16
    var fw = bw >> 4;
    var fh = bh >> 4;
    this.element.width = w;
    this.element.height = h;

    // insert color swaths
    for (let i = 0; i < 2; ++i)
      for (let j = 0; j < 8; ++j) {
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
    for (let i = 0; i < this.ii; ++i)
      for (let j = 0; j < this.jj; ++j) {
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
var toolicons = [0, 14, 15, 17];
toolbar.setIcons([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13]);
toolbar.setHandler((c) => {
  for (let i = 0; i < commands.length; ++i)
    if (c === commands[i][1]) {
      commands[i][2]();
      window.localStorage.setItem('current_image', serializeImage());
      return;
    }
});
toolbar.pressed[4] = minimal_pixel_change;
toolbar.pressed[12] = grid;
toolbar.icons[0] = toolicons[tool];
toolbar.deactivated[5] = true;
toolbar.draw();

// fullscreen manager
var fullscreen = new FullscreenManager('container', (state) => {
  toolbar.pressed[9] = state;
  toolbar.draw();
});

// import image
function importImage(img)
{
  // image is loaded, copy it to a canvas to resize and process
  var importcanvas = document.createElement("canvas");
  let w = backbuffer.width;
  let h = backbuffer.height;
  importcanvas.width = w;
  importcanvas.height = h;
  var importctx = importcanvas.getContext('2d');
  var rx = img.width / w, ry = img.height / h;
  // shrink to canvas preseving aspect ratio, but never enlarge
  var rr = Math.max(1.0, Math.max(rx, ry));

  // scaled width and height, copy image to import canvas
  var sw = Math.floor(img.width / rr), sh = Math.floor(img.height / rr);
  importctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, sw, sh);

  // set up datastructures
  var dist = new Int32Array(new ArrayBuffer(4 * 16 * 64));
  var ibx = Math.ceil(sw / 8);
  var iby = Math.ceil(sh / 8);

  // build a distance table for C64 pallette color pairs (floats)
  var ccdist = new Array(256);
  if (dithering !== 0)
    for (let i = 0; i < 16; ++i)
      for (let j = 0; j <= i; ++j) {
        let r0 = palette[i].red;
        let g0 = palette[i].green;
        let b0 = palette[i].blue;
        let r1 = palette[j].red;
        let g1 = palette[j].green;
        let b1 = palette[j].blue;
        ccdist[i*16+j] = Math.sqrt((r1-r0)*(r1-r0) + (g1-g0)*(g1-g0) + (b1-b0)*(b1-b0));
        ccdist[j*16+i] = ccdist[i*16+j];
      }

  // initialize floyd-steinberg error matrix (if needed)
  var error = null;
  if (dithering === 2)
    error = new Float32Array(new ArrayBuffer(8*8 * 4 * 3)); // 4byte/float32 * rgb

  // loop over blocks and color reduce
  var buf;
  for (let bx = 0; bx < ibx; ++bx)
    for (let by = 0; by < iby; ++by)
    {
      // get image data for current block
      buf = importctx.getImageData(bx * 8 , by * 8, 8, 8);

      // build distance table for all 16 commodore palette entries and 64 pixels in the current block
      let i = 0;
      for (let col = 0; col < 16; ++col)
      {
        let r = palette[col].red;
        let g = palette[col].green;
        let b = palette[col].blue;
        for (let px = 0; px < 64; ++px)
          dist[i++] = (buf.data[px*4]-r)*(buf.data[px*4]-r) +
                      (buf.data[px*4+1]-g)*(buf.data[px*4+1]-g) +
                      (buf.data[px*4+2]-b)*(buf.data[px*4+2]-b);
      }

      // find 2-color combination with minimum distance square sum
      var other_color_factor = 0.01;
      var sum, msum = null, match;
      for (let c1 = 1; c1 < 16; ++c1)
        for (let c2 = 0; c2 < c1; ++c2)
        {
          // generate metric
          sum = 0;
          for (let px = 0; px < 64; ++px) {
            sum += Math.min(dist[c1*64+px], dist[c2*64+px]);
            // if we are dithering we mix in the disregarded distance as well
            if (dithering !== 0)
              sum += other_color_factor * Math.max(dist[c1*64+px], dist[c2*64+px]);
          }
          if (msum === null || sum < msum) {
            msum = sum;
            match = [c1, c2, msum];
          }
        }

      // distance between the two matched colors (needed for dithering)
      let dmatch = ccdist[match[0]*16 + match[1]];

      // loop over block and raster it
      var bl = image[bx + by * nbx];
      let px = 0;
      for (let y = 0; y < 8; ++y) {
        bl.pix[y] = 0;
        for (let x = 0; x < 8; ++x) {
          bl.pix[y] <<= 1;
          let d0 = dist[match[0]*64+px];
          let d1 = dist[match[1]*64+px];

          if (dithering === 0) {// || (dithering === 1 && (d0 > dmatch*dmatch || d1 > dmatch*dmatch))) {
            // no dithering
            if (d0 < d1)
              bl.pix[y]++;
          } else {
            let sd0 = Math.sqrt(d0);
            let sd1 = Math.sqrt(d1);

            if (dithering === 1) {
              // random dithering
              // if (Math.random() * (sd0 + sd1) > sd0)
              if (Math.random() * (d0 + d1) > d0) // crisper
                bl.pix[y]++;
            } else if (dithering === 2) {
              // floyd-steinberg dithering
              let eid = x * 3 + y * 8 * 3;

              // compute diffused rgb errors
              let er = [0, 0, 0];
              for (let c = 0; c < 3; ++c) {
                let weight = 0
                if (y > 0) {
                  er[c] += 5.0 * error[eid - 24];
                  weight = 5;
                  if (x < 7) { er[c] += 3.0 * error[eid - 21]; weight += 3; }
                  if (x > 0) { er[c] += 3.0 * error[eid - 27]; weight += 3; }
                }
                if (x > 0) { er[c] += 7.0/16.0 * error[eid - 3]; weight += 7; }
                if (weight > 0) er[c] /= weight;
              }

              // compute distance to fg and bg color
              let fsd = [0, 0];
              let fer = [0, 0];
              let feg = [0, 0];
              let feb = [0, 0];
              for (let i = 0; i < 2; ++i) {
                let mr = palette[match[i]].red;
                let mg = palette[match[i]].green;
                let mb = palette[match[i]].blue;

                let ir = buf.data[px*4] + er[0];
                let ig = buf.data[px*4 + 1] + er[1];
                let ib = buf.data[px*4 + 2] + er[2];

                fsd[i] = (mr-ir)*(mr-ir) + (mg-ig)*(mg-ig) + (mb-ib)*(mb-ib);
                // error associated with match i
                fer[i] = ir - mr;
                feg[i] = ig - mg;
                feb[i] = ib - mb;
              }

              if (fsd[0] < fsd[1]) {
                bl.pix[y]++;
                error[eid] = fer[0];
                error[eid+1] = feg[0];
                error[eid+2] = feb[0];
              }
              else {
                error[eid] = fer[1];
                error[eid+1] = feg[1];
                error[eid+2] = feb[1];
              }
            }
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

  var files = targetFiles || e.dataTransfer.files;
  if (files.length > 1) {
    alert("Drop one file at a time.");
    return;
  }

  var file = files[0];
  console.log(file);

  // Hi-Eddi C64 file
  if (file.name.match('.*\.pic$') && confirm("Import as Hi-Eddi file?")) {
    saveHistory();
    var reader = new FileReader();
    reader.onload = (e) => {
      const view = new Int8Array(e.target.result);
      // loop over blocks and raster it
      for (let b = 0; b < 40*25; ++b)
      {
        let bl = image[b];

        // pixels
        for (let y = 0; y < 8; ++y) {
          bl.pix[y] = view[2+b*8+y];
        }

        if (view.length >= (2+9*25*40)) {
          // color
          bl.fg = view[2+0x2000+b] % 16;
          bl.bg = Math.floor(view[2+0x2000+b] / 16);
        } else {
          // monochrome
          bl.fg = 1;
          bl.bg = 0;
        }
      }
      redraw();
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  // Modern image file
  if (file.type.match('image.*')) {
    var img = new Image();
    img.onload = () => {
      saveHistory();
      importImage(img);
    };

    var reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.readAsDataURL(file);
    return;
  }

  alert("Select a supported image file. E.g. .jpg, .png, .hed")
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
