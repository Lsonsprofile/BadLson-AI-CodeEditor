import http from 'http';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World\n');
});

server.listen(5001, '0.0.0.0', () => {
  console.log('Test server running on http://0.0.0.0:5001');
});