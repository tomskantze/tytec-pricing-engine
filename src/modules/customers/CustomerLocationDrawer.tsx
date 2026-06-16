import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Select, Space, Switch } from 'antd'
import { defaultRatesForMode, rateLabelOptions } from '../../domain/rateCards'
import type { CategoryRateLabel, CategoryRateType, Customer, LocationCard, LocationTierRate, RateCardMode, ShiftLabel, ShiftRate, TierLevel } from '../../domain/types'

type ShiftFormValues = {
  shift?: ShiftLabel
  includedHours?: number | null
  callOutFee?: number | null
  additionalHours?: number | null
  fullShiftRate?: number | null
}

type TierRateFormValues = {
  tier?: TierLevel
  shift?: CategoryRateLabel
  rateType?: CategoryRateType
  rate?: number | null
}

type LocationFormValues = {
  city?: string
  cityCode?: string
  siteAliases?: string
  country?: string
  currency?: string
  rateCardMode?: RateCardMode
  invoiceMode?: Customer['defaultInvoiceMode']
  slaEnabled?: boolean
  slaAmount?: number | null
  slaAttributedTo?: string
  slaNote?: string
  shifts?: ShiftFormValues[]
  tierRates?: TierRateFormValues[]
}

const rateModelOptions = [
  { value: 'time-window', label: 'Time Window' },
  { value: 'category', label: 'Category' },
]

function amount(value: number | null | undefined) {
  return Number(value ?? 0)
}

function locationId(values: LocationFormValues) {
  const basis = `${values.cityCode || values.city || 'location'}-${Date.now()}`
  return `loc-${basis.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function defaultShift(mode: RateCardMode): ShiftLabel {
  return mode === 'category' ? 'REG' : '08:00-18:00'
}

function defaultShifts(mode: RateCardMode): ShiftRate[] {
  return defaultRatesForMode(mode).map((shift) => ({ ...shift }))
}

function toShiftRate(shift: ShiftFormValues, mode: RateCardMode): ShiftRate {
  const next: ShiftRate = {
    shift: shift.shift ?? defaultShift(mode),
    includedHours: amount(shift.includedHours),
    callOutFee: amount(shift.callOutFee),
    additionalHours: amount(shift.additionalHours),
    fullShiftRate: amount(shift.fullShiftRate),
  }
  if (mode === 'category') {
    next.includedHours = 0
    next.callOutFee = 0
    next.fullShiftRate = 0
  }
  return next
}

function toTierRate(rate: TierRateFormValues): LocationTierRate {
  const shift = rate.shift || 'REG'
  return {
    tier: rate.tier || 'Tier 1',
    shift,
    rateType: shift === 'OBH1' ? rate.rateType || 'Day' : 'Day',
    rate: amount(rate.rate),
  }
}

function makeLocation(
  values: LocationFormValues,
  location: LocationCard | null,
  customerKey?: string,
): LocationCard {
  const rateCardMode = customerKey === 'AKAM'
    ? 'category'
    : values.rateCardMode ?? location?.rateCardMode ?? 'time-window'
  const slaEnabled = Boolean(values.slaEnabled)
  return {
    id: location?.id ?? locationId(values),
    city: values.city?.trim() || '',
    cityCode: values.cityCode?.trim() || '',
    siteAliases: Array.from(new Set(
      String(values.siteAliases || '')
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    )),
    country: values.country?.trim() || '',
    currency: values.currency || 'EUR',
    rateCardMode,
    invoiceMode: values.invoiceMode ?? 'monthly',
    slaEnabled,
    slaAmount: slaEnabled ? amount(values.slaAmount) : 0,
    slaAttributedTo: slaEnabled ? values.slaAttributedTo?.trim() || undefined : undefined,
    slaNote: slaEnabled ? values.slaNote?.trim() || undefined : undefined,
    endCustomerOverrides: location?.endCustomerOverrides ?? [],
    tierRates: rateCardMode === 'category'
      ? (values.tierRates ?? location?.tierRates ?? []).map(toTierRate)
      : [],
    shifts: (values.shifts ?? location?.shifts ?? defaultShifts(rateCardMode))
      .map((shift) => toShiftRate(shift, rateCardMode)),
  }
}

export function CustomerLocationDrawer({
  customerKey,
  location,
  mode,
  onCancel,
  onSave,
}: {
  customerKey?: string
  location: LocationCard | null
  mode: 'add' | 'edit'
  onCancel: () => void
  onSave: (location: LocationCard) => void
}) {
  const [form] = Form.useForm<LocationFormValues>()
  const slaEnabled = Form.useWatch('slaEnabled', form) ?? location?.slaEnabled ?? false
  const isAkamai = customerKey === 'AKAM'
  const rateCardMode = Form.useWatch('rateCardMode', form) ?? (isAkamai ? 'category' : location?.rateCardMode ?? 'time-window')
  const categoryMode = rateCardMode === 'category'
  const akamaiCategoryMode = isAkamai && categoryMode

  function setRateCardMode(nextMode: RateCardMode) {
    form.setFieldsValue({ rateCardMode: nextMode, shifts: defaultShifts(nextMode) })
  }

  function save(values: LocationFormValues) {
    onSave(makeLocation(values, location, customerKey))
  }

  return (
    <Form<LocationFormValues>
      className="erp-edit-form edit-stack"
      form={form}
      initialValues={{
        city: location?.city,
        cityCode: location?.cityCode,
        siteAliases: (location?.siteAliases || []).join(', '),
        country: location?.country,
        currency: location?.currency ?? 'EUR',
        rateCardMode: isAkamai ? 'category' : location?.rateCardMode ?? 'time-window',
        invoiceMode: location?.invoiceMode ?? 'monthly',
        slaEnabled: location?.slaEnabled ?? false,
        slaAmount: location?.slaAmount,
        slaAttributedTo: location?.slaAttributedTo,
        slaNote: location?.slaNote,
        shifts: location?.shifts.length
          ? location.shifts
          : defaultShifts(isAkamai ? 'category' : location?.rateCardMode ?? 'time-window'),
        tierRates: location?.tierRates || [],
      }}
      layout="vertical"
      onFinish={save}
    >
      <Card className="section-card" variant="borderless">
        <div className="form-grid form-grid-two">
          <Form.Item name="city" label="City" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="cityCode" label="City Code">
            <Input />
          </Form.Item>
          <Form.Item name="country" label="Country" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="siteAliases" label="Site Aliases">
            <Input placeholder="BULK, Stack, BULK | Stack" />
          </Form.Item>
          <Form.Item name="currency" label="Currency">
            <Select options={[{ value: 'EUR', label: 'EUR' }, { value: 'SEK', label: 'SEK' }, { value: 'NOK', label: 'NOK' }]} />
          </Form.Item>
          {isAkamai ? null : (
            <Form.Item name="rateCardMode" label="Rate Model">
              <Select onChange={setRateCardMode} options={rateModelOptions} />
            </Form.Item>
          )}
          <Form.Item name="invoiceMode" label="Invoice Mode">
            <Select options={[{ value: 'monthly', label: 'Monthly' }, { value: 'task', label: 'Per Task' }]} />
          </Form.Item>
          <Form.Item name="slaEnabled" label="SLA Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          {slaEnabled ? (
            <>
              <Form.Item name="slaAmount" label="SLA Amount">
                <InputNumber min={0} precision={2} />
              </Form.Item>
              <Form.Item name="slaAttributedTo" label="SLA Attributed To">
                <Input />
              </Form.Item>
              <Form.Item name="slaNote" label="SLA Note">
                <Input />
              </Form.Item>
            </>
          ) : null}
        </div>
      </Card>

      {!akamaiCategoryMode ? (
      <Card className="section-card" variant="borderless">
        <Form.List name="shifts">
          {(fields, { add, remove }) => (
            <div className="shift-edit-list">
              <div className="toolbar-row">
                <strong>{categoryMode ? 'Category Rates' : 'Shift Rates'}</strong>
                <Button icon={<PlusOutlined />} onClick={() => add(defaultShifts(rateCardMode)[0])}>
                  {categoryMode ? 'Add Rate' : 'Add Shift'}
                </Button>
              </div>
              {fields.map((field) => (
                <div className="shift-edit-row" key={field.key}>
                  <Form.Item name={[field.name, 'shift']} label={categoryMode ? 'Rate Label' : 'Shift'}>
                    <Select options={rateLabelOptions(rateCardMode)} />
                  </Form.Item>
                  {categoryMode ? null : (
                    <Form.Item name={[field.name, 'callOutFee']} label="Call-out Fee">
                      <InputNumber min={0} precision={2} />
                    </Form.Item>
                  )}
                  {categoryMode ? null : (
                    <Form.Item name={[field.name, 'includedHours']} label="Includes">
                      <InputNumber min={0} precision={2} />
                    </Form.Item>
                  )}
                  <Form.Item name={[field.name, 'additionalHours']} label={categoryMode ? 'Hourly Rate' : 'Additional Hour'}>
                    <InputNumber min={0} precision={2} />
                  </Form.Item>
                  {categoryMode ? null : (
                    <Form.Item name={[field.name, 'fullShiftRate']} label="Full Shift">
                      <InputNumber min={0} precision={2} />
                    </Form.Item>
                  )}
                  <Form.Item className="shift-remove-item" label=" ">
                    <Button aria-label="Remove shift" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                  </Form.Item>
                </div>
              ))}
            </div>
          )}
        </Form.List>
      </Card>
      ) : null}

      {categoryMode ? (
        <Card className="section-card" variant="borderless">
          <Form.List name="tierRates">
            {(fields, { add, remove }) => (
              <div className="shift-edit-list">
                <div className="toolbar-row">
                  <strong>Tier Rates</strong>
                  <Button icon={<PlusOutlined />} onClick={() => add({ tier: 'Tier 1', shift: 'REG', rateType: 'Day', rate: 0 })}>
                    Add Tier Rate
                  </Button>
                </div>
                {fields.map((field) => (
                  <div className="shift-edit-row" key={field.key}>
                    <Form.Item name={[field.name, 'tier']} label="Tier">
                      <Select options={[{ value: 'Tier 1', label: 'Tier 1' }, { value: 'Tier 2', label: 'Tier 2' }, { value: 'Tier 3', label: 'Tier 3' }]} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'shift']} label="Bucket">
                      <Select options={[{ value: 'REG', label: 'REG' }, { value: 'OBH1', label: 'OBH1' }]} />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(previous, next) => previous.tierRates?.[field.name]?.shift !== next.tierRates?.[field.name]?.shift}>
                      {({ getFieldValue }) => {
                        const shift = getFieldValue(['tierRates', field.name, 'shift']) || 'REG'
                        if (shift !== 'OBH1') {
                          return (
                            <Form.Item label="Rate Type">
                              <Input value="-" disabled />
                            </Form.Item>
                          )
                        }
                        return (
                          <Form.Item name={[field.name, 'rateType']} label="Rate Type">
                            <Select options={[{ value: 'Day', label: 'Day' }, { value: 'Night', label: 'Night' }]} />
                          </Form.Item>
                        )
                      }}
                    </Form.Item>
                    <Form.Item name={[field.name, 'rate']} label="Rate">
                      <InputNumber min={0} precision={2} />
                    </Form.Item>
                    <Form.Item className="shift-remove-item" label=" ">
                      <Button aria-label="Remove tier rate" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                    </Form.Item>
                  </div>
                ))}
              </div>
            )}
          </Form.List>
        </Card>
      ) : null}

      <div className="drawer-action-row">
        <Space size={8}>
          <Button htmlType="button" onClick={() => form.submit()} type="primary">{mode === 'add' ? 'Add Location' : 'Save Changes'}</Button>
          <Button htmlType="button" onClick={onCancel}>Cancel</Button>
        </Space>
      </div>
    </Form>
  )
}
