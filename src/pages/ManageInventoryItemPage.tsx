import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Header } from '../components/admin-dashboard/Header'
import { ProfileModal } from '../components/admin-dashboard/ProfileModal'
import { AddOnPickerModal } from '../components/admin-dashboard/AddOnPickerModal'
import ConfirmActionModal from '../components/ConfirmActionModal'
import {
  ArrowLeftIcon,
  ImagePlaceholderIconFilled,
  StepperAddIconFilled,
  StepperSubtractIconFilled,
  PlusIconSmallFilled,
  TrashIconFilled,
  TrashCanIconFilled,
  SaveIconFilled,
} from '../components/admin-dashboard/icons'
import {
  deleteEquipment,
  fetchEquipment,
  fetchEquipmentAddonOptions,
  fetchEquipmentCheckedOutCount,
  listEquipment,
  replaceEquipmentAddons,
  updateEquipment,
  uploadEquipmentImage,
  type CreateEquipmentAddonInput,
} from '../lib/inventory'
import { CATEGORY_OPTIONS } from '../lib/equipmentCategories'
import type { Equipment, EquipmentCategory, UserProfile } from '../types'
import formStyles from './AddInventoryItemPage.module.css'
import styles from './ManageInventoryItemPage.module.css'

type ProductType = 'hardware' | 'consumable'
type AddonType = 'optional' | 'required'

interface FormSnapshot {
  productName: string
  description: string
  replacementValue: string
  quantity: number
  productType: ProductType
  category: EquipmentCategory | ''
  docLink: string
  hasOptionalAddons: boolean
  hasRequiredAddons: boolean
  optionalAddonIds: string[]
  requiredAddonIds: string[]
}

function sameIdSet(list: Equipment[], ids: string[]): boolean {
  if (list.length !== ids.length) return false
  const idSet = new Set(ids)
  return list.every((item) => idSet.has(item.id))
}

export default function ManageInventoryItemPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const [isProfileOpen, setProfileOpen] = useState(false)

  const [isLoading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [checkedOutCount, setCheckedOutCount] = useState(0)

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

  const [isSaving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isDeleting, setDeleting] = useState(false)
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isQuantityLimitOpen, setQuantityLimitOpen] = useState(false)
  const [isUnsavedChangesOpen, setUnsavedChangesOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<FormSnapshot | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    Promise.all([fetchEquipment(id), fetchEquipmentCheckedOutCount(id), fetchEquipmentAddonOptions(id)])
      .then(([equipment, checkedOut, addons]) => {
        if (cancelled) return
        setProductName(equipment.name)
        setDescription(equipment.description ?? '')
        setReplacementValue(equipment.replacement_value != null ? String(equipment.replacement_value) : '')
        setQuantity(equipment.quantity_total)
        setProductType(equipment.product_type)
        setCategory(equipment.category ?? '')
        setDocLink(equipment.documentation_url ?? '')
        setImagePreviewUrl(equipment.image_url)
        setCheckedOutCount(checkedOut)

        const optional = addons.filter((addon) => addon.addonType === 'optional').map((addon) => addon.equipment)
        const required = addons.filter((addon) => addon.addonType === 'required').map((addon) => addon.equipment)
        setOptionalAddons(optional)
        setRequiredAddons(required)
        setHasOptionalAddons(optional.length > 0)
        setHasRequiredAddons(required.length > 0)

        setSnapshot({
          productName: equipment.name,
          description: equipment.description ?? '',
          replacementValue: equipment.replacement_value != null ? String(equipment.replacement_value) : '',
          quantity: equipment.quantity_total,
          productType: equipment.product_type,
          category: equipment.category ?? '',
          docLink: equipment.documentation_url ?? '',
          hasOptionalAddons: optional.length > 0,
          hasRequiredAddons: required.length > 0,
          optionalAddonIds: optional.map((item) => item.id),
          requiredAddonIds: required.map((item) => item.id),
        })
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load inventory item:', error)
        if (!cancelled) setLoadError('Could not load this item. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

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
    () => equipmentOptions.filter((item) => item.id !== id && !selectedAddonIds.has(item.id)),
    [equipmentOptions, selectedAddonIds, id],
  )

  function handleSelectAddon(equipment: Equipment) {
    if (activePicker === 'optional') {
      setOptionalAddons((current) => [...current, equipment])
    } else if (activePicker === 'required') {
      setRequiredAddons((current) => [...current, equipment])
    }
    setActivePicker(null)
  }

  function handleRemoveAddon(type: AddonType, addonId: string) {
    if (type === 'optional') {
      setOptionalAddons((current) => current.filter((item) => item.id !== addonId))
    } else {
      setRequiredAddons((current) => current.filter((item) => item.id !== addonId))
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
      if (previous && previous.startsWith('blob:')) URL.revokeObjectURL(previous)
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

  function handleDecreaseQuantity() {
    const next = quantity - 1
    if (next < 1) return
    if (next < checkedOutCount) {
      setQuantityLimitOpen(true)
      return
    }
    setQuantity(next)
  }

  const isDirty = useMemo(() => {
    if (!snapshot) return false
    if (imageFile) return true
    return (
      productName !== snapshot.productName ||
      description !== snapshot.description ||
      replacementValue !== snapshot.replacementValue ||
      quantity !== snapshot.quantity ||
      productType !== snapshot.productType ||
      category !== snapshot.category ||
      docLink !== snapshot.docLink ||
      hasOptionalAddons !== snapshot.hasOptionalAddons ||
      hasRequiredAddons !== snapshot.hasRequiredAddons ||
      !sameIdSet(optionalAddons, snapshot.optionalAddonIds) ||
      !sameIdSet(requiredAddons, snapshot.requiredAddonIds)
    )
  }, [
    snapshot,
    imageFile,
    productName,
    description,
    replacementValue,
    quantity,
    productType,
    category,
    docLink,
    hasOptionalAddons,
    hasRequiredAddons,
    optionalAddons,
    requiredAddons,
  ])

  function handleBackClick() {
    if (isDirty) {
      setUnsavedChangesOpen(true)
      return
    }
    navigate('/adminHome/inventory')
  }

  const isConsumable = productType === 'consumable'

  const canSave =
    productName.trim().length > 0 &&
    description.trim().length > 0 &&
    (isConsumable || (replacementValue.trim().length > 0 && !Number.isNaN(Number(replacementValue)))) &&
    (isConsumable || category !== '') &&
    (isConsumable || !hasOptionalAddons || optionalAddons.length > 0) &&
    (isConsumable || !hasRequiredAddons || requiredAddons.length > 0)

  async function handleSave() {
    if (!id || !canSave || isSaving) return

    setSaving(true)
    setSaveError(null)

    try {
      const imageUrl = imageFile ? await uploadEquipmentImage(imageFile) : imagePreviewUrl ?? ''

      await updateEquipment(id, {
        name: productName.trim(),
        description: description.trim(),
        imageUrl,
        productType,
        category: isConsumable ? null : (category as EquipmentCategory),
        replacementValue: isConsumable ? null : Number(replacementValue),
        quantityTotal: quantity,
        documentationUrl: isConsumable ? null : docLink.trim() || null,
      })

      const addonInputs: CreateEquipmentAddonInput[] = isConsumable
        ? []
        : [
            ...(hasOptionalAddons
              ? optionalAddons.map((item) => ({ addonEquipmentId: item.id, addonType: 'optional' as const }))
              : []),
            ...(hasRequiredAddons
              ? requiredAddons.map((item) => ({ addonEquipmentId: item.id, addonType: 'required' as const }))
              : []),
          ]
      await replaceEquipmentAddons(id, addonInputs)

      navigate('/adminHome/inventory')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to save inventory item:', error)
      setSaveError('Something went wrong saving this item. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmDelete() {
    if (!id || isDeleting) return

    setDeleting(true)
    setSaveError(null)

    try {
      await deleteEquipment(id)
      navigate('/adminHome/inventory')
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete inventory item:', error)
      setSaveError('Could not delete this item. Please try again.')
      setDeleteConfirmOpen(false)
    } finally {
      setDeleting(false)
    }
  }

  function handleLogOut() {
    setProfileOpen(false)
    signOut()
  }

  if (isLoading) {
    return (
      <div className={formStyles.page}>
        <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />
        <p className={styles.status}>Loading…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={formStyles.page}>
        <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />
        <p className={styles.status}>{loadError}</p>
      </div>
    )
  }

  return (
    <div className={formStyles.page}>
      <Header userName={user?.name ?? ''} onProfileClick={() => setProfileOpen(true)} />

      <div className={formStyles.topRow}>
        <button
          type="button"
          className={formStyles.topBackButton}
          onClick={handleBackClick}
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
          <span>Back</span>
        </button>
        <h1 className={formStyles.heading}>Manage product details</h1>
        <div className={styles.headerActions}>
          <button type="button" className={styles.saveButton} onClick={() => void handleSave()} disabled={!canSave || isSaving}>
            <SaveIconFilled size={18} />
            <span>{isSaving ? 'Saving…' : 'Save'}</span>
          </button>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={isSaving || isDeleting}
          >
            <TrashCanIconFilled size={18} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      <main className={formStyles.main}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className={isDraggingImage ? `${formStyles.dropzone} ${formStyles.dropzoneActive}` : formStyles.dropzone}
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
              <img src={imagePreviewUrl} alt="Product preview" className={formStyles.dropzonePreview} />
              <span className={formStyles.dropzoneReplaceHint}>Click or drag to replace</span>
            </>
          ) : (
            <>
              <ImagePlaceholderIconFilled className={formStyles.dropzoneIcon} />
              <span className={formStyles.dropzoneLabel}>
                <span className={formStyles.dropzoneLabelDesktop}>Drag an image to upload (REQUIRED)</span>
                <span className={formStyles.dropzoneLabelMobile}>Tap to upload an image (REQUIRED)</span>
              </span>
              <span className={formStyles.dropzoneSubtext}>Use an image with a clear background</span>
            </>
          )}
        </button>

        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="product-name">Product name (REQUIRED)</label>
          <input
            id="product-name"
            className={formStyles.input}
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
          />
        </div>

        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="product-description">
            One-sentence description of product (REQUIRED)
          </label>
          <textarea
            id="product-description"
            className={formStyles.textarea}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        {!isConsumable && (
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="replacement-value">
              Product replacement value (REQUIRED)
            </label>
            <div className={formStyles.currencyField}>
              <span className={formStyles.currencyPrefix}>$</span>
              <input
                id="replacement-value"
                className={formStyles.currencyInput}
                inputMode="decimal"
                value={replacementValue}
                onChange={(event) => setReplacementValue(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className={formStyles.quantityRow}>
          <span className={formStyles.quantityLabel}>Total quantity of product</span>
          <div className={formStyles.stepper}>
            <button
              type="button"
              className={formStyles.stepperButton}
              onClick={handleDecreaseQuantity}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
            >
              <StepperSubtractIconFilled size={16} />
            </button>
            <span className={formStyles.stepperValue}>{quantity}</span>
            <button
              type="button"
              className={formStyles.stepperButton}
              onClick={() => setQuantity((current) => current + 1)}
              aria-label="Increase quantity"
            >
              <StepperAddIconFilled size={16} />
            </button>
          </div>
        </div>

        <div className={formStyles.field}>
          <label className={formStyles.label}>Product type</label>
          <div className={formStyles.typeToggle}>
            <button
              type="button"
              className={
                productType === 'hardware'
                  ? `${formStyles.typeOption} ${formStyles.typeOptionActive}`
                  : formStyles.typeOption
              }
              onClick={() => setProductType('hardware')}
            >
              Hardware
            </button>
            <button
              type="button"
              className={isConsumable ? `${formStyles.typeOption} ${formStyles.typeOptionActive}` : formStyles.typeOption}
              onClick={() => setProductType('consumable')}
            >
              Consumable
            </button>
          </div>
        </div>

        {!isConsumable && (
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="item-category">
              Item category (REQUIRED)
            </label>
            <select
              id="item-category"
              className={formStyles.select}
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
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="doc-link">
              Link to item-specific documentation (OPTIONAL)
            </label>
            <input
              id="doc-link"
              className={formStyles.input}
              value={docLink}
              onChange={(event) => setDocLink(event.target.value)}
            />
          </div>
        )}

        {!isConsumable && (
          <>
            <div className={formStyles.yesNoRow}>
              <span className={formStyles.yesNoLabel}>Does this item have any OPTIONAL add-ons?</span>
              <div className={formStyles.yesNoToggle}>
                <button
                  type="button"
                  className={
                    hasOptionalAddons
                      ? `${formStyles.yesNoOption} ${formStyles.yesNoOptionActive}`
                      : formStyles.yesNoOption
                  }
                  onClick={() => setHasOptionalAddons(true)}
                >
                  YES
                </button>
                <button
                  type="button"
                  className={
                    !hasOptionalAddons
                      ? `${formStyles.yesNoOption} ${formStyles.yesNoOptionActive}`
                      : formStyles.yesNoOption
                  }
                  onClick={() => setHasOptionalAddons(false)}
                >
                  NO
                </button>
              </div>
            </div>

            {hasOptionalAddons && (
              <div className={formStyles.addonCard}>
                <span className={formStyles.addonCardLabel}>
                  Select OPTIONAL add-ons associated with this product
                </span>
                {optionalAddons.length > 0 && (
                  <ul className={formStyles.addonList}>
                    {optionalAddons.map((item) => (
                      <li key={item.id} className={formStyles.addonItem}>
                        {item.image_url && <img src={item.image_url} alt="" className={formStyles.addonItemThumb} />}
                        <span className={formStyles.addonItemInfo}>
                          <span className={formStyles.addonItemName}>{item.name}</span>
                          {item.description && (
                            <span className={formStyles.addonItemDescription}>{item.description}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          className={formStyles.addonRemoveButton}
                          onClick={() => handleRemoveAddon('optional', item.id)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <TrashIconFilled size={20} color="rgba(0, 0, 0, 0.6)" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className={formStyles.addonCardBody}>
                  <button type="button" className={formStyles.addonAddButton} onClick={() => setActivePicker('optional')}>
                    <PlusIconSmallFilled size={18} color="#4a647f" />
                    Add product
                  </button>
                </div>
              </div>
            )}

            <div className={formStyles.yesNoRow}>
              <span className={formStyles.yesNoLabel}>Does this item have any REQUIRED add-ons?</span>
              <div className={formStyles.yesNoToggle}>
                <button
                  type="button"
                  className={
                    hasRequiredAddons
                      ? `${formStyles.yesNoOption} ${formStyles.yesNoOptionActive}`
                      : formStyles.yesNoOption
                  }
                  onClick={() => setHasRequiredAddons(true)}
                >
                  YES
                </button>
                <button
                  type="button"
                  className={
                    !hasRequiredAddons
                      ? `${formStyles.yesNoOption} ${formStyles.yesNoOptionActive}`
                      : formStyles.yesNoOption
                  }
                  onClick={() => setHasRequiredAddons(false)}
                >
                  NO
                </button>
              </div>
            </div>

            {hasRequiredAddons && (
              <div className={formStyles.addonCard}>
                <span className={formStyles.addonCardLabel}>
                  Select REQUIRED add-ons associated with this product
                </span>
                {requiredAddons.length > 0 && (
                  <ul className={formStyles.addonList}>
                    {requiredAddons.map((item) => (
                      <li key={item.id} className={formStyles.addonItem}>
                        {item.image_url && <img src={item.image_url} alt="" className={formStyles.addonItemThumb} />}
                        <span className={formStyles.addonItemInfo}>
                          <span className={formStyles.addonItemName}>{item.name}</span>
                          {item.description && (
                            <span className={formStyles.addonItemDescription}>{item.description}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          className={formStyles.addonRemoveButton}
                          onClick={() => handleRemoveAddon('required', item.id)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <TrashIconFilled size={20} color="rgba(0, 0, 0, 0.6)" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className={formStyles.addonCardBody}>
                  <button type="button" className={formStyles.addonAddButton} onClick={() => setActivePicker('required')}>
                    <PlusIconSmallFilled size={18} color="#4a647f" />
                    Add product
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {saveError && <p className={formStyles.submitError}>{saveError}</p>}
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

      <ConfirmActionModal
        isOpen={isDeleteConfirmOpen}
        heading="Delete this product?"
        body={[
          `${productName || 'This item'} will be permanently removed from the inventory. This cannot be undone.`,
        ]}
        confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
        confirmDisabled={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ConfirmActionModal
        isOpen={isQuantityLimitOpen}
        heading="Can't reduce quantity"
        body={[
          `${checkedOutCount} unit${checkedOutCount === 1 ? ' is' : 's are'} currently checked out. Total quantity can't go below the number of units checked out.`,
        ]}
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setQuantityLimitOpen(false)}
        onCancel={() => setQuantityLimitOpen(false)}
      />

      <ConfirmActionModal
        isOpen={isUnsavedChangesOpen}
        heading="Leave without saving?"
        body={['You have unsaved changes to this product. If you leave now, they will be lost.']}
        confirmLabel="Leave without saving"
        onConfirm={() => navigate('/adminHome/inventory')}
        onCancel={() => setUnsavedChangesOpen(false)}
      />
    </div>
  )
}
