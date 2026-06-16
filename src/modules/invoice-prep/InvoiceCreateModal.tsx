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
  jiraRequired,
  open,
  settlementMode,
  onClose,
  onCreateInvoice,
}: {
  existingPeriods: string[]
  jiraRequired: boolean
  open: boolean
  settlementMode?: boolean
  onClose: () => void
  onCreateInvoice: (input: { customerFile?: File; jiraFile?: File; invoicePdf?: File; payinfoPdf?: File; label: string; month: number; year: number }) => Promise<void>
}) {
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [customerFile, setCustomerFile] = useState<File | null>(null)
  const [jiraFile, setJiraFile] = useState<File | null>(null)
  const [invoicePdf, setInvoicePdf] = useState<File | null>(null)
  const [payinfoPdf, setPayinfoPdf] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const periodLabel = useMemo(() => formatPeriod(month, year), [month, year])
  const hasDuplicate = !settlementMode && existingPeriods.includes(periodLabel)

  useEffect(() => {
    if (!open) {
      setMonth(currentMonth)
      setYear(currentYear)
      setCustomerFile(null)
      setJiraFile(null)
      setInvoicePdf(null)
      setPayinfoPdf(null)
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

  const invoicePdfUploadProps: UploadProps = {
    accept: '.pdf',
    beforeUpload: (file) => {
      setInvoicePdf(file)
      return false
    },
    maxCount: 1,
    showUploadList: false,
  }

  const payinfoPdfUploadProps: UploadProps = {
    accept: '.pdf',
    beforeUpload: (file) => {
      setPayinfoPdf(file)
      return false
    },
    maxCount: 1,
    showUploadList: false,
  }

  async function handleCreate() {
    const missingPrimary = settlementMode ? !invoicePdf : !customerFile
    if (missingPrimary || (jiraRequired && !jiraFile) || hasDuplicate) return
    setSubmitting(true)
    try {
      await onCreateInvoice({
        customerFile: customerFile || undefined,
        jiraFile: jiraFile || undefined,
        invoicePdf: invoicePdf || undefined,
        payinfoPdf: payinfoPdf || undefined,
        label: periodLabel,
        month,
        year,
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      cancelText="Cancel"
      confirmLoading={submitting}
      okButtonProps={{ disabled: settlementMode ? !invoicePdf : !customerFile || (jiraRequired && !jiraFile) || hasDuplicate }}
      okText={settlementMode ? 'Import Settlement' : 'Create Invoice'}
      onCancel={onClose}
      onOk={() => void handleCreate()}
      open={open}
      title={settlementMode ? 'Import Settlement' : 'Create New Invoice'}
    >
      <div className="invoice-create-grid">
        {settlementMode ? (
          <div className="invoice-create-field invoice-create-period">
            <span>Settlement Period</span>
            <strong>Derived from the invoice PDF date</strong>
          </div>
        ) : (
          <>
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
          </>
        )}
        <div className="invoice-create-field">
          <span>{settlementMode ? 'Shift-scheduler Report' : 'Customer Report'}</span>
          <Upload {...customerUploadProps}>
            <Button>Choose File</Button>
          </Upload>
          <Typography.Text className="page-description">{customerFile?.name || (settlementMode ? 'Optional Oslo split report (CSV/XLSX)' : 'XLSX first sheet or CSV')}</Typography.Text>
        </div>
        {jiraRequired ? (
          <div className="invoice-create-field">
            <span>Jira Report</span>
            <Upload {...jiraUploadProps}>
              <Button>Choose File</Button>
            </Upload>
            <Typography.Text className="page-description">{jiraFile?.name || 'CSV export for the same month'}</Typography.Text>
          </div>
        ) : null}
        {!jiraRequired ? (
          <div className="invoice-create-field">
            <span>Invoice PDF</span>
            <Upload {...invoicePdfUploadProps}>
              <Button>Choose File</Button>
            </Upload>
            <Typography.Text className="page-description">{invoicePdf?.name || 'Required vendor invoice bundle PDF'}</Typography.Text>
          </div>
        ) : null}
        {!jiraRequired ? (
          <div className="invoice-create-field">
            <span>Payinfo PDF</span>
            <Upload {...payinfoPdfUploadProps}>
              <Button>Choose File</Button>
            </Upload>
            <Typography.Text className="page-description">{payinfoPdf?.name || 'Vendor payinfo PDF'}</Typography.Text>
          </div>
        ) : null}
      </div>
      {hasDuplicate ? <Alert message={`An invoice for ${periodLabel} already exists.`} showIcon type="warning" /> : null}
    </Modal>
  )
}
