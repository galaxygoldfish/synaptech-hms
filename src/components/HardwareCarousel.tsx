import { useEffect, useState } from 'react'
import museImg from '../assets/muse-2.png'
import jetsonImg from '../assets/jetson-nano.png'
import markIvImg from '../assets/openbci-mark-iv.png'
import oculusImg from '../assets/oculus-quest-2.png'
import styles from './HardwareCarousel.module.css'

const ROTATE_INTERVAL_MS = 4000

const ITEMS = [
  {
    id: 'muse-2',
    name: 'Muse 2',
    description: 'A headband-style EEG recording device',
    image: museImg,
  },
  {
    id: 'jetson-nano',
    name: 'NVIDIA Jetson Nano',
    description: 'Compact and powerful computing board designed for AI workflows',
    image: jetsonImg,
  },
  {
    id: 'mark-iv',
    name: 'OpenBCI Mark IV Ultracortex',
    description: 'A 16-channel scalp EEG recording device',
    image: markIvImg,
  },
  {
    id: 'oculus-quest-2',
    name: 'Oculus Quest 2',
    description: 'Virtual reality headset that includes 2 controllers',
    image: oculusImg,
  },
]

export default function HardwareCarousel() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % ITEMS.length)
    }, ROTATE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const item = ITEMS[index]

  return (
    <div className={styles.carousel} aria-hidden="true">
      <div className={styles.slide} key={item.id}>
        <img src={item.image} alt="" className={styles.image} />

        <div className={styles.dots}>
          {ITEMS.map((dotItem, dotIndex) => (
            <span
              key={dotItem.id}
              className={dotIndex === index ? `${styles.dot} ${styles.dotActive}` : styles.dot}
            />
          ))}
        </div>

        <p className={styles.name}>{item.name}</p>
        <p className={styles.description}>{item.description}</p>
      </div>
    </div>
  )
}
