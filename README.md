# Scrap Sifter LAN multiplayer

Install dependencies once with `npm install`, then start the host with `npm start`.
The server prints the LAN addresses it detects. Other players on the same network
can open one of those `http://<address>:3000` links in a browser. Set `PORT` to
use another port, or `HOST` to change the listen address.

The server owns player simulation, block state, and chunk generation. Clients
request voxel data for their render distance and build chunk meshes locally.
