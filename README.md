# draw
A collaborative drawing server.

## Usage
Host the draw.html file and the draw.jpg files separately.  Note line 17 has node.js write directly to the draw.jpg file, so you may need to change that line.

## Example
Change line 17 in draw-server.js to `var binary_file = ./draw.jpg`.
    cd draw/
    python -m SimpleHTTPServer &
    node draw-server.js
