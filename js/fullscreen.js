class FullscreenManager {
  constructor(container_name, state_callback) {
    this.container = document.getElementById(container_name);

    for (let name of ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'])
      if (document['on' + name] !== undefined)
        this.eventname = name;

    for (let name of ['fullscreenElement', 'webkitFullscreenElement', 'mozFullScreenElement'])
      if (document[name] !== undefined)
        this.elementname = name;

    for (let name of ['exitFullscreen', 'webkitExitFullscreen', 'mozCancelFullScreen'])
      if (document[name] !== undefined)
        this.exitname = name;

    // event listener to update toolbar
    document.addEventListener("webkitfullscreenchange", (e) => {
      state_callback(document[this.elementname] !== null);
    });
  }

  // toggle between fullscreen and windowed
  toggle() {
    if (document[this.elementname] !== null) {
      document[this.exitname]();
    } else {
      let c = this.container;
      if (c.requestFullScreen) {
        c.requestFullScreen();
      } else if (c.webkitRequestFullscreen) {
        c.webkitRequestFullscreen();
      } else if (c.mozRequestFullScreen) {
        c.mozRequestFullScreen();
      }
    }
  }
}
