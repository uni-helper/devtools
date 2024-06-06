import lzString from 'lz-string'

const data = {
  id: 1,
  name: '啊啊啊',
  list: [
    { name: 'a' },
    { name: 'b' },
    { name: 'c' },
    { name: 'd' },
    { name: 'e' },
    { name: 'f' },
    { name: 'g' },
    { name: 'h' },
    { name: 'i' },
    { name: 'j' },
  ],
}

console.log(lzString.compressToBase64(JSON.stringify(data)))


export function postMessage(data: any) {
  
}
