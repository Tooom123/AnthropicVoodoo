import { useState } from 'react'

export default function FileUpload({ files, onChange }) {
  const [dragging, setDragging] = useState(false)

  function readFile(file) {
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = e =>
        resolve({ name: file.name, type: file.type, dataUrl: e.target.result })
      reader.readAsDataURL(file)
    })
  }

  async function addFiles(raw) {
    const images = Array.from(raw).filter(f => f.type.startsWith('image/'))
    if (!images.length) return
    const read = await Promise.all(images.map(readFile))
    onChange([...files, ...read].slice(0, 4))
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  function handleInput(e) {
    addFiles(e.target.files)
    e.target.value = ''
  }

  function remove(i) {
    onChange(files.filter((_, idx) => idx !== i))
  }

  const inputId = 'screenshot-upload'

  return (
    <div className="space-y-3">
      <div
        className="relative border-2 border-dashed rounded-xl transition-colors cursor-pointer"
        style={{
          borderColor: dragging ? '#4f46e5' : '#e5e7eb',
          backgroundColor: dragging ? '#eef2ff' : 'transparent',
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById(inputId).click()}
      >
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleInput}
        />
        <div className="py-8 flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="4" width="16" height="12" rx="2" stroke="#9ca3af" strokeWidth="1.5"/>
              <circle cx="7" cy="8" r="1.5" stroke="#9ca3af" strokeWidth="1.5"/>
              <polyline points="2,14 6,10 9,13 13,9 18,14" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-sm text-gray-400 font-sans">
            Drop screenshots here or <span className="text-indigo-500">browse</span>
          </p>
          <p className="text-xs text-gray-300 font-mono">PNG, JPG — up to 4 images</p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative group aspect-video">
              <img
                src={f.dataUrl}
                alt={f.name}
                className="w-full h-full object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={e => { e.stopPropagation(); remove(i) }}
                className="absolute top-1 right-1 w-5 h-5 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-red-500 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
