import { useEffect, useState } from 'react'
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch'
import { AppHeader } from '../../components/AppHeader'
import { BrushButton } from '../../components/BrushButton'
import { EmptyState } from '../../components/EmptyState'

// Put the picture at public/ui/map/world-map.jpg: the screen finds it by itself, no code change needed
const MAP_URL = `${import.meta.env.BASE_URL}ui/map/world-map.jpg`

type MapFile = 'checking' | 'missing' | 'ready'

/** Loads the map once to learn whether the file exists (a missing file answers 404). */
function useMapFile(): MapFile {
  const [state, setState] = useState<MapFile>('checking')
  useEffect(() => {
    let cancelled = false
    const probe = new Image()
    probe.onload = () => !cancelled && setState('ready')
    probe.onerror = () => !cancelled && setState('missing')
    probe.src = MAP_URL
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

/** "+", "−" and "Сбросить" for a mouse; on a phone the map is pinched and dragged with fingers. */
function Controls() {
  const { zoomIn, zoomOut, resetTransform } = useControls()
  return (
    <div className="map-controls" role="group" aria-label="Масштаб карты">
      <BrushButton aria-label="Отдалить" onClick={() => void zoomOut()}>
        −
      </BrushButton>
      <BrushButton aria-label="Приблизить" onClick={() => void zoomIn()}>
        +
      </BrushButton>
      <BrushButton onClick={() => void resetTransform()}>Сбросить</BrushButton>
    </div>
  )
}

/** World map of the campaign: zoom with two fingers or the wheel, drag to move. */
export function MapPage() {
  const file = useMapFile()
  return (
    <>
      <AppHeader />
      <div>
        <h1 style={{ fontSize: 32 }}>Карта мира</h1>
        <span className="brush-underline" aria-hidden="true" />
      </div>
      {file === 'checking' && <p className="muted">Загружаю карту…</p>}
      {file === 'missing' && (
        <EmptyState icon="map" title="Карта скоро появится">
          Мастер добавит её, когда карта будет готова.
        </EmptyState>
      )}
      {file === 'ready' && (
        <TransformWrapper minScale={1} maxScale={8} centerOnInit limitToBounds doubleClick={{ mode: 'zoomIn' }}>
          <Controls />
          <TransformComponent wrapperClass="map-viewport" contentClass="map-content">
            <img className="map-image" src={MAP_URL} alt="Карта мира кампании «Хвор»" draggable={false} />
          </TransformComponent>
        </TransformWrapper>
      )}
    </>
  )
}
