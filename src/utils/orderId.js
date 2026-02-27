let counter = 0;

function generateUniqueOrderId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  counter = (counter + 1) % 100000;
  const seq = String(counter).padStart(5, '0');
  return `UL-${year}${month}${day}-${seq}`;
}

module.exports = generateUniqueOrderId;

