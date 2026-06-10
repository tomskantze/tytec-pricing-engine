import { Alert, Button, InputNumber, Modal, Select, Typography, Upload } from 'antd'
import type { UploadProps } from 'antd'
import { useEffect, useMemo, useState } from 'react'

const monthOptions = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
].map((label, index) => ({ label, value: index }))

function formatPeriod(month: number, year: number) {
  return `${monthOptions[month]?.label || 'Month'} ${year}`
}

export function InvoiceCreateModal({
  existingPeriods,
  open,
  onClose,
  onCreateInvoice,
}: {
  existingPeriods: string[]
  open: boolean
  onClose: () => void
  onCreateInvoice: (input: { customerFile: File; jiraFile: File; label: string; month: number; year: number }) => Promise<void>
}) {
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [customerFile, setCustomerFile] = useState<File | null>(null)
  const [jiraFile, setJiraFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const periodLabel = useMemo(() => formatPeriod(month, year), [month, year])
  const hasDuplicate = existingPeriods.includes(periodLabel)

  useEffect(() => {
    if (!open) {
      setMonth(currentMonth)
      setYear(currentYear)
      setCustomerFile(null)
      setJiraFile(null)
      setSubmitting(false)
    }
  }, [currentMonth, currentYear, open])

  const customerUploadProps: UploadProps = {
    accept: '.xlsx,.csv',
    beforeUpload: (file) => {
      setCustomerFile(file)
      return false
    },
    maxCount: 1,
    showUploadList: false,
  }

  const jiraUploadProps: UploadProps = {
    accept: '.csv',
    beforeUpload: (file) => {
      setJiraFile(file)
      return false
    },
    maxCount: 1,
    showUploadList: false,
  }

  async function handleCreate() {
    if (!customerFile || !jiraFile || hasDuplicate) return
    setSubmitting(true)
    try {
      await onCreateInvoice({ customerFile, jiraFile, label: periodLabel, month, year })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      cancelText="Cancel"
      confirmLoading={submitting}
      okButtonProps={{ disabled: !customerFile || !jiraFile || hasDuplicate }}
      okText="Create Invoice"
      onCancel={onClose}
      onOk={() => void handleCreate()}
      open={open}
      title="Create New Invoice"
    >
      <div className="invoice-create-grid">
        <div className="invoice-create-field">
          <span>Month</span>
          <Select onChange={setMonth} options={monthOptions} value={month} />
        </div>
        <div className="invoice-create-field">
          <span>Year</span>
          <InputNumber className="invoice-create-year" max={2100} min={2000} onChange={(value) => typeof value === 'number' && setYear(value)} value={year} />
        </div>
        <div className="invoice-create-field invoice-create-period">
          <span>Invoice Period</span>
          <strong>{periodLabel}</strong>
        </div>
        <div className="invoice-create-field">
          <span>Customer Report</span>
          <Upload {...customerUploadProps}>
            <Button>Choose File</Button>
          </Upload>
          <Typography.Text className="page-description">{customerFile?.name || 'XLSX first sheet or CSV'}</Typography.Text>
        </div>
        <div className="invoice-create-field">
          <span>Jira Report</span>
          <Upload {...jiraUploadProps}>
            <Button>Choose File</Button>
          </Upload>
          <Typography.Text className="page-description">{jiraFile?.name || 'CSV export for the same month'}</Typography.Text>
        </div>
      </div>
      {hasDuplicate ? <Alert message={`An invoice for ${periodLabel} already exists.`} showIcon type="warning" /> : null}
    </Modal>
  )
}
