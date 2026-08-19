import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/admin-dashboard/Header'
import { ProfileModal } from '../components/admin-dashboard/ProfileModal'
import { AddOnPickerModal } from '../components/admin-dashboard/AddOnPickerModal'
import {
  ArrowLeftIcon,
  ImagePlaceholderIconFilled,
  StepperAddIconFilled,
  StepperSubtractIconFilled,
  PlusIconSmallFilled,
  TrashIconFilled,
} from '../components/admin-dashboard/icons'
import {
  createEquipment,
  createEquipmentAddons,
  createEquipmentUnits,
  listEquipment,
  uploadEquipmentImage,
  type CreateEquipmentAddonInput,
} from '../lib/inventory'
import { generateSerialNumbers } from '../lib/serialNumber'
import { CATEGORY_OPTIONS } from '../lib/equipmentCategories'
import type { Equipment, EquipmentCategory, UserProfile } from '../types'
import styles from './AddInventoryItemPage.module.css'

type ProductType = 'hardware' | 'consumable'
type AddonType = 'optional' | 'required'

export default function AddInventoryItemPage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [isDraggingImage, setDraggingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [productName, setProductName] = useState('')
  const [description, setDescription] = useState('')
  const [replacementValue, setReplacementValue] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [productType, setProductType] = useState<ProductType>('hardware')
  const [category, setCategory] = useState<EquipmentCategory | ''>('')
  const [docLink, setDocLink] = useState('')
  const [hasOptionalAddons, setHasOptionalAddons] = useState(false)
  const [hasRequiredAddons, setHasRequiredAddons] = useState(false)
  const [optionalAddons, setOptionalAddons] = useState<Equipment[]>([])
  const [requiredAddons, setRequiredAddons] = useState<Equipment[]>([])
  const [activePicker, setActivePicker] = useState<AddonType | null>(null)
  const [equipmentOptions, setEquipmentOptions] = useState<Equipment[]>([])
  const [isLoadingEquipment, setLoadingEquipment] = useState(false)
  const [equipmentLoadError, setEquipmentLoadError] = useState<string | null>(null)

  const [isSubmitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingEquipment(true)
    listEquipment()
      .then((items) => {
        if (!cancelled) setEquipmentOptions(items)
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load inventory for add-on picker:', error)
        if (!cancelled) setEquipmentLoadError('Could not load inventory. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoadingEquipment(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedAddonIds = useMemo(
    () => new Set([...optionalAddons, ...requiredAddons].map((item) => item.id)),
    [optionalAddons, requiredAddons],
  )
  const pickerOptions = useMemo(
    () => equipmentOptions.filter((item) => !selectedAddonIds.has(item.id)),
    [equipmentOptions, selectedAddonIds],
  )

  function handleSelectAddon(equipment: Equipment) {
    if (activePicker === 'optional') {
      setOptionalAddons((current) => [...current, equipment])
    } else if (activePicker === 'required') {
      setRequiredAddons((current) => [...current, equipment])
    }
    setActivePicker(null)
  }

  function handleRemoveAddon(type: AddonType, id: string) {
    if (type === 'optional') {
      setOptionalAddons((current) => current.filter((item) => item.id !== id))
    } else {
      setRequiredAddons((current) => current.filter((item) => item.id !== id))
    }
  }

  const user = useMemo<UserProfile | null>(() => {
    if (!profile) return null
    return {
      name: `${profile.first_name} ${profile.last_name}`,
      role: profile.role === 'admin' ? 'ADMINISTRATOR' : 'MEMBER',
      email: profile.uw_email,
      handle: profile.discord,
      location: profile.address,
    }
  }, [profile])

  function applyImageFile(file: File | null) {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    setImagePreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return URL.createObjectURL(file)
    })
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    applyImageFile(event.target.files?.[0] ?? null)
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDraggingImage(false)
    applyImageFile(event.dataTransfer.files?.[0] ?? null)
  }

  const isConsumable = productType === 'consumable'

  const canProceed =
    imageFile !== null &&
    productName.trim().length > 0 &&
    description.trim().length > 0 &&
    (isConsumable || (replacementValue.trim().length > 0 && !Number.isNaN(Number(replacementValue)))) &&
    (isConsumable || category !== '') &&
    (isConsumable || !hasOptionalAddons || optionalAddons.length > 0) &&
    (isConsumable || !hasRequiredAddons || requiredAddons.length > 0)

  async function handleNext() {
    if (!canProceed || isSubmitting || !imageFile) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const imageUrl = await uploadEquipmentImage(imageFile)
      const equipment = await createEquipment({
        name: productName.trim(),
        description: description.trim(),
        imageUrl,
        productType,
        category: isConsumable ? null : (category as EquipmentCategory),
        replacementValue: isConsumable ? null : Number(replacementValue),
        quantityTotal: quantity,
        documentationUrl: isConsumable ? null : docLink.trim() || null,
      })

      const addonInputs: CreateEquipmentAddonInput[] = [
        ...(hasOptionalAddons
          ? optionalAddons.map((item) => ({ addonEquipmentId: item.id, addonType: 'optional' as const }))
          : []),
        ...(hasRequiredAddons
          ? requiredAddons.map((item) => ({ addonEquipmentId: item.id, addonType: 'required' as const }))
          : []),
      ]
      if (addonInputs.length > 0) {
        await createEquipmentAddons(equipment.id, addonInputs)
      }

      // Consumables aren't individually serialized, so they don't get
      // equipment_units or labels — go straight to the done screen.
      if (isConsumable) {
        navigate('/adminHome/add-item/done')
        return
      }

      const serials = generateSerialNumbers(quantity)
      await createEquipmentUnits(equipment.id, serials)

      navigate('/adminHome/add-item/labels', {
        state: { productName: equipment.name, imagePreviewUrl: imageUrl, quantity, serials },
      })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add inventory item:', error)
      setSubmitError('Something went wrong adding this item. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  return (
    <div className={styles.page}>
      <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <div className={styles.topRow}>
        <button
          type="button"
          className={styles.topBackButton}
          onClick={() => navigate('/adminHome')}
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
          <span>Back</span>
        </button>
        <h1 className={styles.heading}>Add a new hardware product</h1>
        <div />
      </div>

      <main className={styles.main}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className={isDraggingImage ? `${styles.dropzone} ${styles.dropzoneActive}` : styles.dropzone}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDraggingImage(true)
          }}
          onDragLeave={() => setDraggingImage(false)}
          onDrop={handleDrop}
        >
          {imagePreviewUrl ? (
            <>
              <img src={imagePreviewUrl} alt="Product preview" className={styles.dropzonePreview} />
              <span className={styles.dropzoneReplaceHint}>Click or drag to replace</span>
            </>
          ) : (
            <>
              <ImagePlaceholderIconFilled className={styles.dropzoneIcon} />
              <span className={styles.dropzoneLabel}>
                <span className={styles.dropzoneLabelDesktop}>Drag an image to upload (REQUIRED)</span>
                <span className={styles.dropzoneLabelMobile}>Tap to upload an image (REQUIRED)</span>
              </span>
              <span className={styles.dropzoneSubtext}>Use an image with a clear background</span>
            </>
          )}
        </button>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="product-name">Product name (REQUIRED)</label>
          <input
            id="product-name"
            className={styles.input}
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="product-description">
            One-sentence description of product (REQUIRED)
          </label>
          <textarea
            id="product-description"
            className={styles.textarea}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        {!isConsumable && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="replacement-value">
              Product replacement value (REQUIRED)
            </label>
            <div className={styles.currencyField}>
              <span className={styles.currencyPrefix}>$</span>
              <input
                id="replacement-value"
                className={styles.currencyInput}
                inputMode="decimal"
                value={replacementValue}
                onChange={(event) => setReplacementValue(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className={styles.quantityRow}>
          <span className={styles.quantityLabel}>Total quantity of product</span>
          <div className={styles.stepper}>
            <button
              type="button"
              className={styles.stepperButton}
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
            >
              <StepperSubtractIconFilled size={16} />
            </button>
            <span className={styles.stepperValue}>{quantity}</span>
            <button
              type="button"
              className={styles.stepperButton}
              onClick={() => setQuantity((current) => current + 1)}
              aria-label="Increase quantity"
            >
              <StepperAddIconFilled size={16} />
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Product type</label>
          <div className={styles.typeToggle}>
            <button
              type="button"
              className={productType === 'hardware' ? `${styles.typeOption} ${styles.typeOptionActive}` : styles.typeOption}
              onClick={() => setProductType('hardware')}
            >
              Hardware
            </button>
            <button
              type="button"
              className={isConsumable ? `${styles.typeOption} ${styles.typeOptionActive}` : styles.typeOption}
              onClick={() => setProductType('consumable')}
            >
              Consumable
            </button>
          </div>
        </div>

        {!isConsumable && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="item-category">
              Item category (REQUIRED)
            </label>
            <select
              id="item-category"
              className={styles.select}
              value={category}
              onChange={(event) => setCategory(event.target.value as EquipmentCategory)}
              required
            >
              <option value="" disabled>
                Select a category
              </option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isConsumable && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="doc-link">
              Link to item-specific documentation (OPTIONAL)
            </label>
            <input
              id="doc-link"
              className={styles.input}
              value={docLink}
              onChange={(event) => setDocLink(event.target.value)}
            />
          </div>
        )}

        {!isConsumable && (
          <>
            <div className={styles.yesNoRow}>
              <span className={styles.yesNoLabel}>Does this item have any OPTIONAL add-ons?</span>
              <div className={styles.yesNoToggle}>
                <button
                  type="button"
                  className={hasOptionalAddons ? `${styles.yesNoOption} ${styles.yesNoOptionActive}` : styles.yesNoOption}
                  onClick={() => setHasOptionalAddons(true)}
                >
                  YES
                </button>
                <button
                  type="button"
                  className={!hasOptionalAddons ? `${styles.yesNoOption} ${styles.yesNoOptionActive}` : styles.yesNoOption}
                  onClick={() => setHasOptionalAddons(false)}
                >
                  NO
                </button>
              </div>
            </div>

            {hasOptionalAddons && (
              <div className={styles.addonCard}>
                <span className={styles.addonCardLabel}>
                  Select OPTIONAL add-ons associated with this product
                </span>
                {optionalAddons.length > 0 && (
                  <ul className={styles.addonList}>
                    {optionalAddons.map((item) => (
                      <li key={item.id} className={styles.addonItem}>
                        {item.image_url && <img src={item.image_url} alt="" className={styles.addonItemThumb} />}
                        <span className={styles.addonItemInfo}>
                          <span className={styles.addonItemName}>{item.name}</span>
                          {item.description && (
                            <span className={styles.addonItemDescription}>{item.description}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          className={styles.addonRemoveButton}
                          onClick={() => handleRemoveAddon('optional', item.id)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <TrashIconFilled size={20} color="rgba(0, 0, 0, 0.6)" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className={styles.addonCardBody}>
                  <button type="button" className={styles.addonAddButton} onClick={() => setActivePicker('optional')}>
                    <PlusIconSmallFilled size={18} color="#4a647f" />
                    Add product
                  </button>
                </div>
              </div>
            )}

            <div className={styles.yesNoRow}>
              <span className={styles.yesNoLabel}>Does this item have any REQUIRED add-ons?</span>
              <div className={styles.yesNoToggle}>
                <button
                  type="button"
                  className={hasRequiredAddons ? `${styles.yesNoOption} ${styles.yesNoOptionActive}` : styles.yesNoOption}
                  onClick={() => setHasRequiredAddons(true)}
                >
                  YES
                </button>
                <button
                  type="button"
                  className={!hasRequiredAddons ? `${styles.yesNoOption} ${styles.yesNoOptionActive}` : styles.yesNoOption}
                  onClick={() => setHasRequiredAddons(false)}
                >
                  NO
                </button>
              </div>
            </div>

            {hasRequiredAddons && (
              <div className={styles.addonCard}>
                <span className={styles.addonCardLabel}>
                  Select REQUIRED add-ons associated with this product
                </span>
                {requiredAddons.length > 0 && (
                  <ul className={styles.addonList}>
                    {requiredAddons.map((item) => (
                      <li key={item.id} className={styles.addonItem}>
                        {item.image_url && <img src={item.image_url} alt="" className={styles.addonItemThumb} />}
                        <span className={styles.addonItemInfo}>
                          <span className={styles.addonItemName}>{item.name}</span>
                          {item.description && (
                            <span className={styles.addonItemDescription}>{item.description}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          className={styles.addonRemoveButton}
                          onClick={() => handleRemoveAddon('required', item.id)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <TrashIconFilled size={20} color="rgba(0, 0, 0, 0.6)" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className={styles.addonCardBody}>
                  <button type="button" className={styles.addonAddButton} onClick={() => setActivePicker('required')}>
                    <PlusIconSmallFilled size={18} color="#4a647f" />
                    Add product
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {submitError && <p className={styles.submitError}>{submitError}</p>}

        <div className={styles.actions}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/adminHome')}>
            back
          </button>
          <button
            type="button"
            className={styles.nextButton}
            onClick={handleNext}
            disabled={!canProceed || isSubmitting}
          >
            {isSubmitting ? 'saving…' : 'next'}
          </button>
        </div>
      </main>

      {isProfileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} onLogOut={handleLogOut} />
      )}

      {activePicker && (
        <AddOnPickerModal
          options={pickerOptions}
          isLoading={isLoadingEquipment}
          error={equipmentLoadError}
          onSelect={handleSelectAddon}
          onClose={() => setActivePicker(null)}
        />
      )}
    </div>
  )
}
