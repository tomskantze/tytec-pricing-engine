import { CheckOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, Space, Table, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { normalizeServiceDate } from '../../domain/dates'
import { displayCity } from '../../domain/displayLocation'
import { getLocationLabel } from '../../domain/matching'
import { formatAmount, formatHours, formatJobTotal, formatOptionalAmount } from '../../domain/money'
import { getPricingDisplay, getPricingDisplayForMode } from '../../domain/pricingDisplay'
import type { Customer, InvoiceBatch, JobReviewOverride, PricedJob, SlaLine } from '../../domain/types'
import { ErpDataTable } from '../../design-system/ErpDataTable'
import type { ErpTableColumn } from '../../design-system/ErpDataTable'
import { StatusBadge, type StatusTone } from '../../design-system/StatusBadge'
import type { RunDocumentMeta } from '../../state/appState'
import { getUploadedDocument, getUploadedDocumentByKind } from '../../state/localDb'
import { InvoiceManualOverridePanel } from './InvoiceManualOverridePanel'
import { PdfDocumentPreview } from './PdfDocumentPreview'

type DesktopWindowApi = {
  saveDocument?: (payload: { id: string; fileName: string; bytes: ArrayBuffer }) => Promise<{ previewUrl: string; storedPath: string }>
}

function desktopWindow() {
  return (window as Window & { desktopWindow?: DesktopWindowApi }).desktopWindow
}

function statusTone(status: PricedJob['queueState']): StatusTone {
  if (status === 'Ready') return 'success'
  if (status === 'Blocked') return 'warning'
  return 'neutral'
}

function stringSort(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

function numberSort(left: number | null | undefined, right: number | null | undefined) {
  return (left ?? Number.NEGATIVE_INFINITY) - (right ?? Number.NEGATIVE_INFINITY)
}

function dateSort(left: string, right: string) {
  const parse = (value: string) => {
    const match = value.match(/^(\d{2})\s([A-Z]{3})\s(\d{4})$/)
    if (!match) return Number.NEGATIVE_INFINITY
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
    return new Date(Number(match[3]), months.indexOf(match[2]), Number(match[1])).getTime()
  }
  return parse(left) - parse(right)
}

function formatInvoiceSummary(job: PricedJob) {
  const summary = job.jiraSummary || job.summary
  const issueKey = String(job.jiraIssueKey || '').trim()
  if (!summary || !issueKey) return summary
  if (summary.endsWith(issueKey)) return summary
  return summary.includes(':') ? summary.replace(/:\s*[^:]+$/, `: ${issueKey}`) : `${summary}: ${issueKey}`
}

function getColumns(categoryMode: boolean): ErpTableColumn<PricedJob>[] {
  const display = getPricingDisplayForMode(categoryMode ? 'category' : 'time-window')
  const columns: ErpTableColumn<PricedJob>[] = [
    { title: 'Date', dataIndex: 'date', erpSize: 'date', sorter: (left, right) => dateSort(left.date, right.date), width: 102 },
    { title: 'Ticket', dataIndex: 'jiraIssueKey', erpSize: 'compact', sorter: (left, right) => stringSort(left.jiraIssueKey || '', right.jiraIssueKey || ''), width: 88 },
    { title: 'Customer Ref', dataIndex: 'ticket', erpSize: 'compact', sorter: (left, right) => stringSort(left.ticket, right.ticket), width: 128 },
    { title: 'Technician', dataIndex: 'technician', erpSize: 'normal', sorter: (left, right) => stringSort(left.technician, right.technician), width: 124 },
    { title: 'Summary', render: (_, job) => formatInvoiceSummary(job), erpSize: 'text', sorter: (left, right) => stringSort(formatInvoiceSummary(left), formatInvoiceSummary(right)), width: 260 },
    { title: 'City', erpSize: 'normal', sorter: (left, right) => stringSort(displayCity(left), displayCity(right)), width: 94, render: (_, job) => displayCity(job) },
    {
      title: 'Call-Out',
      erpSize: 'money',
      sorter: (left, right) => numberSort(left.pricing?.callOutFee, right.pricing?.callOutFee),
      width: 84,
      render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null
        ? '-'
        : categoryMode ? '-'
        : job.pricing?.crossedShift ? 'Split Shift' : formatOptionalAmount(job.currency, job.pricing?.callOutFee || 0),
    },
    { title: display.hourLabels[0], erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.hours.bh, right.pricing?.hours.bh), width: 64, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatHours(job.pricing?.hours.bh || 0) },
    { title: display.amountLabels[0], erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.bhAmount, right.pricing?.bhAmount), width: 96, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatOptionalAmount(job.currency, job.pricing?.bhAmount || 0) },
    { title: display.hourLabels[1], erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.hours.obh, right.pricing?.hours.obh), width: 66, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatHours(job.pricing?.hours.obh || 0) },
    { title: display.amountLabels[1], erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.obhAmount, right.pricing?.obhAmount), width: 102, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatOptionalAmount(job.currency, job.pricing?.obhAmount || 0) },
    { title: 'Consumables', erpSize: 'money', sorter: (left, right) => numberSort(left.consumablesAmount, right.consumablesAmount), width: 100, render: (_, job) => formatOptionalAmount(job.currency, job.consumablesAmount) },
    { title: 'Final', erpSize: 'money', sorter: (left, right) => numberSort(left.totalAmount, right.totalAmount), width: 92, render: (_, job) => formatJobTotal(job.currency, job.totalAmount) },
    {
      title: 'Status',
      erpSize: 'status',
      sorter: (left, right) => stringSort(left.queueState, right.queueState),
      width: 84,
      render: (_, job) => <StatusBadge label={job.queueState} tone={statusTone(job.queueState)} />,
    },
  ]
  if (!categoryMode) {
    columns.splice(11, 0,
      { title: display.hourLabels[2] || 'WH', erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.hours.wh, right.pricing?.hours.wh), width: 60, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatHours(job.pricing?.hours.wh || 0) },
      { title: display.amountLabels[2] || 'WH Amount', erpSize: 'money', sorter: (left, right) => numberSort(left.pricing?.whAmount, right.pricing?.whAmount), width: 96, render: (_, job) => job.reviewOverride?.manualFinalAmount != null || job.reviewOverride?.manualLaborAmount != null ? '-' : formatOptionalAmount(job.currency, job.pricing?.whAmount || 0) },
    )
  }
  return columns
}

type CategoryInvoiceRow = {
  id: string
  source: string
  dateLabel: string
  dateSortValue: string
  invoiceNumber: string
  payinfoNumber: string
  payinfoTotal: number | null
  technician: string
  site: string
  location: string
  rateType: string
  appliedRate: number | null
  vendorHours: number | null
  vendorRate: number | null
  vendorAmount: number | null
  regHours: number
  obh1Hours: number
  amount: number | null
  currency: string
}

type CategoryInvoiceGroupRow = {
  id: string
  dateLabel: string
  dateSortValue: string
  invoiceNumber: string
  technicians: string
  technicianValues: string[]
  site: string
  siteValues: string[]
  location: string
  locationValues: string[]
  payinfoNumber: string
  payinfoTotal: number | null
  lineCount: number
  vendorHours: number | null
  vendorAmount: number | null
  regHours: number
  obh1Hours: number
  amount: number | null
  currency: string
  rows: CategoryInvoiceRow[]
}

type SettlementReconciliationRow = {
  id: string
  invoiceNumber: string
  technician: string
  jobIds: string[]
  period: string
  payinfoNumber: string
  vendorHours: number | null
  appHours: number
  regHours: number
  obh1Hours: number
  vendorRate: number | null
  vendorAmount: number | null
  appAmount: number | null
  hourDifference: number | null
  amountDifference: number | null
  currency: string
}

function buildCategoryInvoiceRows(period: string, jobs: PricedJob[]): CategoryInvoiceRow[] {
  return jobs.map((job) => {
    const serviceDate = String(job.raw.vendorInvoiceDate || job.raw.invoiceDate || job.serviceDate || job.raw.serviceDate || '').trim()
    return {
      id: job.id,
      source: String(job.raw.source || '').trim(),
      dateLabel: serviceDate ? normalizeServiceDate(serviceDate) : job.date || period,
      dateSortValue: serviceDate || job.date || period,
      invoiceNumber: String(job.raw.vendorInvoiceRef || job.raw.invoiceNumber || job.raw.invoiceRef || '').trim(),
      payinfoNumber: String(job.raw.payinfoNumber || job.raw.paymentBatchNumber || job.raw.payinfoRef || '').trim(),
      payinfoTotal: job.raw.payinfoTotal ? Number(job.raw.payinfoTotal) : null,
      technician: job.technician || '-',
      site: String(job.raw.site || '').trim(),
      location: job.matchedLocation ? getLocationLabel(job.matchedLocation) : [job.city, job.country].filter(Boolean).join(', '),
      rateType: String(job.reviewOverride?.manualRateType || job.raw.rateType || '').trim(),
      appliedRate: job.pricing?.lineItems[0]?.unitPrice ?? null,
      vendorHours: job.raw.vendorInvoiceHours ? Number(job.raw.vendorInvoiceHours) : null,
      vendorRate: job.raw.vendorInvoiceRate ? Number(job.raw.vendorInvoiceRate) : null,
      vendorAmount: job.raw.vendorInvoiceAmount ? Number(job.raw.vendorInvoiceAmount) : null,
      regHours: job.pricing?.hours.bh ?? job.reportedHoursByLabel?.REG ?? job.reportedHours?.bh ?? 0,
      obh1Hours: job.pricing?.hours.obh ?? job.reportedHoursByLabel?.OBH1 ?? job.reportedHours?.obh ?? 0,
      amount: job.totalAmount,
      currency: job.currency,
    }
  })
}

function deriveVendorTotals(rows: CategoryInvoiceRow[]) {
  const buckets = new Map<string, {
    vendorHoursFromBase: number | null
    vendorAmountFromBase: number | null
    vendorHoursFromPdf: number
    vendorAmountFromPdf: number
  }>()

  for (const row of rows) {
    const key = `${row.invoiceNumber}:${row.technician}`
    const bucket = buckets.get(key) ?? {
      vendorHoursFromBase: null,
      vendorAmountFromBase: null,
      vendorHoursFromPdf: 0,
      vendorAmountFromPdf: 0,
    }
    const source = String(row.source || '').trim().toLowerCase()
    const isPdfSource = source === 'invoice-pdf' || source === 'invoice-pdf-remainder'
    if (isPdfSource) {
      if (row.vendorHours != null) bucket.vendorHoursFromPdf += row.vendorHours
      if (row.vendorAmount != null) bucket.vendorAmountFromPdf += row.vendorAmount
    } else {
      if (row.vendorHours != null) {
        bucket.vendorHoursFromBase = bucket.vendorHoursFromBase == null
          ? row.vendorHours
          : Math.max(bucket.vendorHoursFromBase, row.vendorHours)
      }
      if (row.vendorAmount != null) {
        bucket.vendorAmountFromBase = bucket.vendorAmountFromBase == null
          ? row.vendorAmount
          : Math.max(bucket.vendorAmountFromBase, row.vendorAmount)
      }
    }
    buckets.set(key, bucket)
  }

  let vendorHours = 0
  let vendorAmount = 0
  let hasVendorHours = false
  let hasVendorAmount = false
  for (const bucket of buckets.values()) {
    if (bucket.vendorHoursFromBase != null) {
      vendorHours += bucket.vendorHoursFromBase
      hasVendorHours = true
    } else if (bucket.vendorHoursFromPdf > 0) {
      vendorHours += bucket.vendorHoursFromPdf
      hasVendorHours = true
    }
    if (bucket.vendorAmountFromBase != null) {
      vendorAmount += bucket.vendorAmountFromBase
      hasVendorAmount = true
    } else if (bucket.vendorAmountFromPdf > 0) {
      vendorAmount += bucket.vendorAmountFromPdf
      hasVendorAmount = true
    }
  }

  return {
    vendorHours: hasVendorHours ? Number(vendorHours.toFixed(2)) : null,
    vendorAmount: hasVendorAmount ? Number(vendorAmount.toFixed(2)) : null,
  }
}

function buildCategoryInvoiceGroupRows(rows: CategoryInvoiceRow[]): CategoryInvoiceGroupRow[] {
  const groups = new Map<string, CategoryInvoiceGroupRow>()
  for (const row of rows) {
    const key = row.invoiceNumber || row.id
    const existing = groups.get(key)
    if (existing) {
      existing.rows.push(row)
      existing.technicianValues = Array.from(new Set([...existing.technicianValues, row.technician])).sort((left, right) => stringSort(left, right))
      existing.siteValues = Array.from(new Set([...existing.siteValues, row.site].filter(Boolean))).sort((left, right) => stringSort(left, right))
      existing.locationValues = Array.from(new Set([...existing.locationValues, row.location].filter(Boolean))).sort((left, right) => stringSort(left, right))
      existing.lineCount += 1
      existing.regHours += row.regHours
      existing.obh1Hours += row.obh1Hours
      existing.amount = Number(((existing.amount || 0) + (row.amount || 0)).toFixed(2))
      if (!existing.payinfoNumber && row.payinfoNumber) existing.payinfoNumber = row.payinfoNumber
      if (existing.payinfoTotal == null && row.payinfoTotal != null) existing.payinfoTotal = row.payinfoTotal
      continue
    }
    groups.set(key, {
      id: key,
      dateLabel: row.dateLabel,
      dateSortValue: row.dateSortValue,
      invoiceNumber: row.invoiceNumber,
      technicians: row.technician,
      technicianValues: [row.technician],
      site: row.site,
      siteValues: row.site ? [row.site] : [],
      location: row.location,
      locationValues: row.location ? [row.location] : [],
      payinfoNumber: row.payinfoNumber,
      payinfoTotal: row.payinfoTotal,
      lineCount: 1,
      vendorHours: null,
      vendorAmount: null,
      regHours: row.regHours,
      obh1Hours: row.obh1Hours,
      amount: row.amount,
      currency: row.currency,
      rows: [row],
    })
  }

  return [...groups.values()]
    .map((group) => {
      const vendorTotals = deriveVendorTotals(group.rows)
      const technicians = group.technicianValues.join(', ')
      const site = group.siteValues.length <= 1 ? (group.siteValues[0] || '-') : `${group.siteValues.length} sites`
      const location = group.locationValues.length <= 1 ? (group.locationValues[0] || '-') : `${group.locationValues.length} locations`
      return {
        ...group,
        technicians,
        site,
        location,
        vendorHours: vendorTotals.vendorHours,
        vendorAmount: vendorTotals.vendorAmount,
        amount: group.amount == null ? null : Number(group.amount.toFixed(2)),
        regHours: Number(group.regHours.toFixed(2)),
        obh1Hours: Number(group.obh1Hours.toFixed(2)),
      }
    })
    .sort((left, right) => stringSort(left.invoiceNumber || left.id, right.invoiceNumber || right.id))
}

function buildSettlementReconciliationRows(jobs: PricedJob[]): SettlementReconciliationRow[] {
  const groups = new Map<string, SettlementReconciliationRow & {
    vendorHoursFromBase: number | null
    vendorAmountFromBase: number | null
    vendorHoursFromPdf: number
    vendorAmountFromPdf: number
  }>()
  for (const job of jobs) {
    const invoiceNumber = String(job.raw.vendorInvoiceRef || job.raw.invoiceNumber || job.raw.invoiceRef || '').trim()
    const technician = String(job.technician || '').trim()
    const period = String(job.raw.vendorInvoicePeriod || '').trim()
    const payinfoNumber = String(job.raw.payinfoNumber || job.raw.paymentBatchNumber || job.raw.payinfoRef || '').trim()
    const key = `${invoiceNumber}:${technician}`
    if (!invoiceNumber || !technician) continue
    const regHours = Number(job.pricing?.hours.bh ?? job.reportedHoursByLabel?.REG ?? job.reportedHours?.bh ?? 0)
    const obh1Hours = Number(job.pricing?.hours.obh ?? job.reportedHoursByLabel?.OBH1 ?? job.reportedHours?.obh ?? 0)
    const vendorHours = job.raw.vendorInvoiceHours ? Number(job.raw.vendorInvoiceHours) : null
    const vendorRate = job.raw.vendorInvoiceRate ? Number(job.raw.vendorInvoiceRate) : null
    const vendorAmount = job.raw.vendorInvoiceAmount ? Number(job.raw.vendorInvoiceAmount) : null
    const source = String(job.raw.source || '').trim().toLowerCase()
    const isPdfSource = source === 'invoice-pdf' || source === 'invoice-pdf-remainder'
    const existing = groups.get(key)
    if (existing) {
      existing.jobIds.push(job.id)
      existing.regHours += regHours
      existing.obh1Hours += obh1Hours
      existing.appHours += regHours + obh1Hours
      existing.appAmount = (existing.appAmount || 0) + (job.totalAmount || 0)
      if (isPdfSource) {
        if (vendorHours != null) existing.vendorHoursFromPdf += vendorHours
        if (vendorAmount != null) existing.vendorAmountFromPdf += vendorAmount
      } else {
        if (vendorHours != null) {
          existing.vendorHoursFromBase = existing.vendorHoursFromBase == null
            ? vendorHours
            : Math.max(existing.vendorHoursFromBase, vendorHours)
        }
        if (vendorAmount != null) {
          existing.vendorAmountFromBase = existing.vendorAmountFromBase == null
            ? vendorAmount
            : Math.max(existing.vendorAmountFromBase, vendorAmount)
        }
      }
      continue
    }
    groups.set(key, {
      id: key,
      invoiceNumber,
      technician,
      jobIds: [job.id],
      period,
      payinfoNumber,
      vendorHours,
      appHours: regHours + obh1Hours,
      regHours,
      obh1Hours,
      vendorRate,
      vendorAmount: null,
      appAmount: job.totalAmount,
      hourDifference: null,
      amountDifference: null,
      currency: job.currency,
      vendorHoursFromBase: isPdfSource ? null : vendorHours,
      vendorAmountFromBase: isPdfSource ? null : vendorAmount,
      vendorHoursFromPdf: isPdfSource && vendorHours != null ? vendorHours : 0,
      vendorAmountFromPdf: isPdfSource && vendorAmount != null ? vendorAmount : 0,
    })
  }
  return [...groups.values()]
    .map((row) => {
      const vendorHours = row.vendorHoursFromBase ?? (row.vendorHoursFromPdf > 0 ? Number(row.vendorHoursFromPdf.toFixed(2)) : null)
      const vendorAmount = row.vendorAmountFromBase ?? (row.vendorAmountFromPdf > 0 ? Number(row.vendorAmountFromPdf.toFixed(2)) : null)
      return {
        ...row,
        vendorHours,
        vendorAmount,
        hourDifference: vendorHours == null ? null : Number((row.appHours - vendorHours).toFixed(2)),
        amountDifference: vendorAmount == null || row.appAmount == null ? null : Number((row.appAmount - vendorAmount).toFixed(2)),
      }
    })
    .sort((left, right) => stringSort(left.invoiceNumber, right.invoiceNumber))
}

function getSettlementReconciliationColumns(): ErpTableColumn<SettlementReconciliationRow>[] {
  return [
    { title: 'Invoice', dataIndex: 'invoiceNumber', erpSize: 'compact', width: 126 },
    { title: 'Technician', dataIndex: 'technician', erpSize: 'normal', width: 168 },
    { title: 'Period', dataIndex: 'period', erpSize: 'text', width: 196, render: (value: string) => value || '-' },
    { title: 'Inv Hours', erpSize: 'money', width: 88, render: (_, row) => row.vendorHours == null ? '-' : formatHours(row.vendorHours) },
    { title: 'Calc Hours', erpSize: 'money', width: 92, render: (_, row) => formatHours(row.appHours) },
    { title: 'REG', erpSize: 'money', width: 78, render: (_, row) => formatHours(row.regHours) },
    { title: 'OBH1', erpSize: 'money', width: 82, render: (_, row) => formatHours(row.obh1Hours) },
    { title: 'Hour Diff', erpSize: 'money', width: 90, render: (_, row) => row.hourDifference == null ? '-' : formatHours(row.hourDifference) },
    { title: 'Inv Amount', erpSize: 'money', width: 108, render: (_, row) => row.vendorAmount == null ? '-' : formatAmount(row.currency, row.vendorAmount) },
    { title: 'Calc Amount', erpSize: 'money', width: 116, render: (_, row) => row.appAmount == null ? '-' : formatAmount(row.currency, row.appAmount) },
    { title: 'Diff', erpSize: 'money', width: 108, render: (_, row) => row.amountDifference == null ? '-' : formatAmount(row.currency, row.amountDifference) },
  ]
}

function uniqueColumnFilters<Row>(rows: Row[], picker: (row: Row) => string) {
  return Array.from(new Set(rows.map(picker).map((value) => String(value || '').trim()).filter(Boolean)))
    .sort((left, right) => stringSort(left, right))
    .map((value) => ({ text: value, value }))
}

function textColumnFilter(value: unknown, rowValue: string) {
  return String(rowValue || '').trim() === String(value || '').trim()
}

function getCategoryInvoiceGroupColumns(rows: CategoryInvoiceGroupRow[]): ErpTableColumn<CategoryInvoiceGroupRow>[] {
  return [
    {
      title: 'Date',
      dataIndex: 'dateLabel',
      erpSize: 'normal',
      width: 112,
      sorter: (left, right) => stringSort(left.dateSortValue || '', right.dateSortValue || ''),
      render: (value: string) => value || '-',
    },
    {
      title: 'Invoice',
      dataIndex: 'invoiceNumber',
      erpSize: 'compact',
      width: 116,
      filterSearch: true,
      filters: uniqueColumnFilters(rows, (row) => row.invoiceNumber),
      onFilter: (value, row) => textColumnFilter(value, row.invoiceNumber),
      sorter: (left, right) => stringSort(left.invoiceNumber || '', right.invoiceNumber || ''),
      render: (value: string) => value || '-',
    },
    {
      title: 'Technicians',
      dataIndex: 'technicians',
      erpSize: 'normal',
      width: 176,
      filterSearch: true,
      filters: Array.from(new Set(rows.flatMap((row) => row.technicianValues))).sort((left, right) => stringSort(left, right)).map((value) => ({ text: value, value })),
      onFilter: (value, row) => row.technicianValues.some((item) => textColumnFilter(value, item)),
      sorter: (left, right) => stringSort(left.technicians, right.technicians),
    },
    {
      title: 'Location',
      dataIndex: 'location',
      erpSize: 'text',
      width: 128,
      filterSearch: true,
      filters: uniqueColumnFilters(rows, (row) => row.location),
      onFilter: (value, row) => textColumnFilter(value, row.location),
      sorter: (left, right) => stringSort(left.location || '', right.location || ''),
      render: (value: string) => value || '-',
    },
    {
      title: 'Lines',
      dataIndex: 'lineCount',
      erpSize: 'compact',
      width: 62,
      sorter: (left, right) => numberSort(left.lineCount, right.lineCount),
    },
    {
      title: 'Inv Hours',
      erpSize: 'money',
      width: 82,
      sorter: (left, right) => numberSort(left.vendorHours, right.vendorHours),
      render: (_, row) => row.vendorHours == null ? '-' : formatHours(row.vendorHours),
    },
    {
      title: 'Inv Amount',
      erpSize: 'money',
      width: 102,
      sorter: (left, right) => numberSort(left.vendorAmount, right.vendorAmount),
      render: (_, row) => row.vendorAmount == null ? '-' : formatAmount(row.currency, row.vendorAmount),
    },
    {
      title: 'REG',
      erpSize: 'money',
      width: 76,
      sorter: (left, right) => numberSort(left.regHours, right.regHours),
      render: (_, row) => formatHours(row.regHours),
    },
    {
      title: 'OBH1',
      erpSize: 'money',
      width: 76,
      sorter: (left, right) => numberSort(left.obh1Hours, right.obh1Hours),
      render: (_, row) => formatHours(row.obh1Hours),
    },
    {
      title: 'Amount',
      erpSize: 'money',
      width: 104,
      sorter: (left, right) => numberSort(left.amount, right.amount),
      render: (_, row) => row.amount == null ? 'Pending' : formatJobTotal(row.currency, row.amount),
    },
  ]
}

function getCategoryInvoiceLineColumns(rows: CategoryInvoiceRow[]): ErpTableColumn<CategoryInvoiceRow>[] {
  return [
    {
      title: 'Technician',
      dataIndex: 'technician',
      erpSize: 'normal',
      width: 156,
      filterSearch: true,
      filters: uniqueColumnFilters(rows, (row) => row.technician),
      onFilter: (value, row) => textColumnFilter(value, row.technician),
      sorter: (left, right) => stringSort(left.technician, right.technician),
    },
    {
      title: 'Site',
      dataIndex: 'site',
      erpSize: 'text',
      width: 136,
      filterSearch: true,
      filters: uniqueColumnFilters(rows, (row) => row.site),
      onFilter: (value, row) => textColumnFilter(value, row.site),
      sorter: (left, right) => stringSort(left.site || '', right.site || ''),
      render: (value: string) => value || '-',
    },
    {
      title: 'Location',
      dataIndex: 'location',
      erpSize: 'text',
      width: 144,
      filterSearch: true,
      filters: uniqueColumnFilters(rows, (row) => row.location),
      onFilter: (value, row) => textColumnFilter(value, row.location),
      sorter: (left, right) => stringSort(left.location || '', right.location || ''),
      render: (value: string) => value || '-',
    },
    {
      title: 'Tech Rate',
      erpSize: 'money',
      width: 96,
      sorter: (left, right) => numberSort(left.appliedRate, right.appliedRate),
      render: (_, row) => row.appliedRate == null ? '-' : formatAmount(row.currency, row.appliedRate),
    },
    {
      title: 'Inv Hours',
      erpSize: 'money',
      width: 82,
      sorter: (left, right) => numberSort(left.vendorHours, right.vendorHours),
      render: (_, row) => row.vendorHours == null ? '-' : formatHours(row.vendorHours),
    },
    {
      title: 'Inv Rate',
      erpSize: 'money',
      width: 90,
      sorter: (left, right) => numberSort(left.vendorRate, right.vendorRate),
      render: (_, row) => row.vendorRate == null ? '-' : formatAmount(row.currency, row.vendorRate),
    },
    {
      title: 'Inv Amount',
      erpSize: 'money',
      width: 98,
      sorter: (left, right) => numberSort(left.vendorAmount, right.vendorAmount),
      render: (_, row) => row.vendorAmount == null ? '-' : formatAmount(row.currency, row.vendorAmount),
    },
    {
      title: 'REG',
      erpSize: 'money',
      width: 72,
      sorter: (left, right) => numberSort(left.regHours, right.regHours),
      render: (_, row) => formatHours(row.regHours),
    },
    {
      title: 'OBH1',
      erpSize: 'money',
      width: 76,
      sorter: (left, right) => numberSort(left.obh1Hours, right.obh1Hours),
      render: (_, row) => formatHours(row.obh1Hours),
    },
    {
      title: 'Amount',
      erpSize: 'money',
      width: 106,
      sorter: (left, right) => numberSort(left.amount, right.amount),
      render: (_, row) => row.amount == null ? 'Pending' : formatJobTotal(row.currency, row.amount),
    },
  ]
}

function metaItem(label: string, value: string) {
  return (
    <span className="invoice-detail-item">
      <strong>{label}:</strong> {value}
    </span>
  )
}

function documentKindLabel(kind: RunDocumentMeta['kind']) {
  if (kind === 'invoice-pdf') return 'Invoice PDF'
  if (kind === 'payinfo-pdf') return 'Payinfo PDF'
  if (kind === 'customer-report') return 'Customer Report'
  return 'Jira Report'
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function parsePayinfoFileNameTotal(fileName: string) {
  const match = String(fileName || '').match(/([0-9][0-9.,\s]{4,})/)
  if (!match?.[1]) return null
  const text = match[1].trim().replace(/\s+/g, '').replace(/[.,]+$/g, '')
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  const decimalIndex = Math.max(lastComma, lastDot)
  if (decimalIndex >= 0) {
    const integerPart = text.slice(0, decimalIndex).replace(/[^0-9-]/g, '')
    const decimalPart = text.slice(decimalIndex + 1).replace(/[^0-9]/g, '')
    const parsed = Number(`${integerPart}.${decimalPart}`)
    return Number.isFinite(parsed) ? parsed : null
  }
  const parsed = Number(text.replace(/[^0-9-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function getSlaColumns(): ErpTableColumn<SlaLine>[] {
  return [
    { title: 'Article', dataIndex: 'articleNumber', erpSize: 'compact', width: 120, render: (value: string | undefined) => value || '-' },
    { title: 'Description', dataIndex: 'label' as const, erpSize: 'text' },
    { title: 'Amount', erpSize: 'money', width: 140, render: (_: unknown, line: SlaLine) => formatAmount(line.currency, line.amount) },
  ]
}

export function InvoiceDetailPanel({
  batch,
  customer,
  documents = [],
  includeSla,
  onAttachDocuments,
  onBulkMoveObh1ToReg,
  onExport,
  onSaveReviewOverride,
  onUpdateDocument,
  onToggleIncludeSla,
}: {
  batch?: InvoiceBatch
  customer: Customer
  documents?: RunDocumentMeta[]
  includeSla: boolean
  onAttachDocuments?: (input: { invoicePdf?: File; payinfoPdf?: File }) => Promise<void>
  onBulkMoveObh1ToReg?: (jobIds: string[]) => void
  onExport: (batch: InvoiceBatch) => void
  onSaveReviewOverride: (jobId: string, override: JobReviewOverride | null) => void
  onUpdateDocument?: (document: RunDocumentMeta) => void
  onToggleIncludeSla: () => void
}) {
  const [expandedCategoryInvoiceId, setExpandedCategoryInvoiceId] = useState('')
  const [expandedReconciliationId, setExpandedReconciliationId] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [activeView, setActiveView] = useState<'lines' | 'documents'>('lines')
  const [documentViewMode, setDocumentViewMode] = useState<'single' | 'compare'>('single')
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [documentStoredPath, setDocumentStoredPath] = useState('')
  const [documentLoading, setDocumentLoading] = useState(false)
  const [documentError, setDocumentError] = useState('')
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false)
  const invoicePdfInputRef = useRef<HTMLInputElement | null>(null)
  const payinfoPdfInputRef = useRef<HTMLInputElement | null>(null)
  const jobs = batch?.items ?? []
  const pdfDocuments = useMemo(
    () => documents.filter((document) => document.kind === 'invoice-pdf' || document.kind === 'payinfo-pdf'),
    [documents],
  )
  const orderedPdfDocuments = useMemo(
    () => [...pdfDocuments].sort((left, right) => stringSort(documentKindLabel(left.kind), documentKindLabel(right.kind))),
    [pdfDocuments],
  )
  const jobsById = useMemo(
    () => new Map(jobs.map((job) => [job.id, job])),
    [jobs],
  )

  useEffect(() => {
    if (selectedJobId && !jobs.some((job) => job.id === selectedJobId)) setSelectedJobId('')
  }, [jobs, selectedJobId])

  useEffect(() => {
    if (expandedCategoryInvoiceId && !jobs.some((job) => (String(job.raw.vendorInvoiceRef || job.raw.invoiceNumber || job.raw.invoiceRef || '').trim() || job.id) === expandedCategoryInvoiceId)) {
      setExpandedCategoryInvoiceId('')
    }
  }, [expandedCategoryInvoiceId, jobs])

  useEffect(() => {
    if (!pdfDocuments.length) {
      setSelectedDocumentId('')
      return
    }
    if (selectedDocumentId && !pdfDocuments.some((document) => document.id === selectedDocumentId)) {
      setSelectedDocumentId('')
    }
  }, [pdfDocuments, selectedDocumentId])

  useEffect(() => {
    if (pdfDocuments.length < 2 && documentViewMode === 'compare') {
      setDocumentViewMode('single')
    }
  }, [documentViewMode, pdfDocuments.length])

  useEffect(() => {
    let isMounted = true

    if (activeView !== 'documents' || !selectedDocumentId) {
      setDocumentStoredPath('')
      setDocumentLoading(false)
      setDocumentError('')
      return () => {}
    }

    setDocumentLoading(true)
    setDocumentError('')
    const api = desktopWindow()
    const selectedDocument = pdfDocuments.find((document) => document.id === selectedDocumentId)
    if (!selectedDocument) {
      setDocumentStoredPath('')
      setDocumentLoading(false)
      setDocumentError('Attached document could not be loaded.')
      return () => {}
    }
    const saveDocument = api?.saveDocument
    const ensureStoredPath = async () => {
      if (selectedDocument.storedPath) return selectedDocument.storedPath
      const legacyDocument = await getUploadedDocument(selectedDocument.id) || await getUploadedDocumentByKind(selectedDocument.kind)
      if (!legacyDocument || !saveDocument) return ''
      const bytes = await legacyDocument.content.arrayBuffer()
      const saved = await saveDocument({ id: selectedDocument.id, fileName: selectedDocument.fileName, bytes })
      if (saved.previewUrl && saved.storedPath && onUpdateDocument) {
        onUpdateDocument({
          ...selectedDocument,
          previewUrl: saved.previewUrl,
          storedPath: saved.storedPath,
        })
      }
      return saved.storedPath || ''
    }
    void ensureStoredPath()
      .then((storedPath) => {
        if (!isMounted) return
        if (!storedPath) {
          setDocumentStoredPath('')
          setDocumentError('PDF preview could not be created.')
          return
        }
        setDocumentStoredPath(storedPath)
      })
      .catch(() => {
        if (!isMounted) return
        setDocumentStoredPath('')
        setDocumentError('Attached document could not be loaded.')
      })
      .finally(() => {
        if (isMounted) setDocumentLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeView, pdfDocuments, selectedDocumentId])

  if (!batch) return null
  const categoryMode = batch.batchKind === 'jobs' && batch.items.length > 0
    && batch.items.every((job) => getPricingDisplay(job).mode === 'category')
  const categoryInvoiceRows = categoryMode ? buildCategoryInvoiceRows(batch.period, batch.items) : []
  const categoryInvoiceGroupRows = categoryMode ? buildCategoryInvoiceGroupRows(categoryInvoiceRows) : []
  const categoryInvoiceGroupColumns = getCategoryInvoiceGroupColumns(categoryInvoiceGroupRows)
  const categoryInvoiceLineColumns = getCategoryInvoiceLineColumns(categoryInvoiceRows)
  const reconciliationRows = categoryMode ? buildSettlementReconciliationRows(batch.items) : []
  const unreconciledRows = reconciliationRows.filter((row) =>
    (row.hourDifference != null && Math.abs(row.hourDifference) > 0.01)
    || (row.amountDifference != null && Math.abs(row.amountDifference) > 0.01),
  )
  const obh1JobIds = categoryMode
    ? batch.items
      .filter((job) => Number(job.pricing?.hours.obh ?? job.reportedHoursByLabel?.OBH1 ?? job.reportedHours?.obh ?? 0) > 0)
      .map((job) => job.id)
    : []
  const payinfoTotals = Array.from(new Set(
    categoryInvoiceRows
      .map((row) => row.payinfoTotal)
      .filter((value): value is number => value != null && Number.isFinite(value) && value > 0),
  ))
  const payinfoFileAmount = documents
    .filter((document) => document.kind === 'payinfo-pdf')
    .map((document) => parsePayinfoFileNameTotal(document.fileName))
    .find((value): value is number => value != null && Number.isFinite(value) && value > 0) ?? null
  const storedPayinfoTotal = payinfoTotals.length === 1 ? payinfoTotals[0] : null
  const payinfoTotal =
    storedPayinfoTotal != null && payinfoFileAmount != null && storedPayinfoTotal > payinfoFileAmount * 10
      ? payinfoFileAmount
      : storedPayinfoTotal ?? payinfoFileAmount
  const slaDisplayTotal = batch.slaLines.reduce((sum, line) => sum + line.amount, 0)
  const displayTotal = batch.batchKind === 'jobs' && includeSla && batch.combinedTotal != null ? batch.combinedTotal : batch.total
  const payinfoDifference = payinfoTotal == null || displayTotal == null ? null : Number((displayTotal - payinfoTotal).toFixed(2))
  const settlementReconciled = categoryMode && payinfoDifference != null && Math.abs(payinfoDifference) <= 0.01
  const showSlaToggle = batch.batchKind === 'jobs' && slaDisplayTotal > 0
  const showDocuments = pdfDocuments.length > 0 || Boolean(onAttachDocuments)
  const selectedDocument = pdfDocuments.find((document) => document.id === selectedDocumentId) || null

  async function handleAttachDocuments(input: { invoicePdf?: File; payinfoPdf?: File }) {
    if (!onAttachDocuments || (!input.invoicePdf && !input.payinfoPdf)) return
    setIsUploadingDocuments(true)
    try {
      await onAttachDocuments(input)
    }
    finally {
      setIsUploadingDocuments(false)
    }
  }

  function renderCategoryLineTable(rows: CategoryInvoiceRow[]) {
    if (rows.length === 1) {
      const job = jobsById.get(rows[0].id)
      if (job) {
        return (
          <div className="invoice-expanded-table">
            <div className="invoice-expanded-editor">
              <InvoiceManualOverridePanel customer={customer} job={job} onSaveOverride={onSaveReviewOverride} />
            </div>
          </div>
        )
      }
    }
    const summaryCurrency = rows[0]?.currency || batch?.currency || 'SEK'
    const totalTechRate = rows.reduce((sum, row) => sum + Number(row.appliedRate || 0), 0)
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    return (
      <div className="invoice-expanded-table">
        <ErpDataTable<CategoryInvoiceRow>
          className="nested-table invoice-job-table"
          columnSizing="manual"
          columns={categoryInvoiceLineColumns}
          dataSource={rows}
          expandable={{
            expandedRowKeys: selectedJobId && rows.some((row) => row.id === selectedJobId) ? [selectedJobId] : [],
            expandedRowRender: (row) => {
              const job = jobsById.get(row.id)
              return job ? (
                <div className="invoice-expanded-editor">
                  <InvoiceManualOverridePanel customer={customer} job={job} onSaveOverride={onSaveReviewOverride} />
                </div>
              ) : null
            },
            showExpandColumn: false,
          }}
          onRow={(row) => ({ onClick: () => setSelectedJobId((current) => (current === row.id ? '' : row.id)) })}
          rowClassName={(row) => (row.id === selectedJobId ? 'selected-row' : '')}
          rowKey="id"
          tableLayout="auto"
          summary={() => (
            <Table.Summary>
              <Table.Summary.Row className="invoice-summary-row invoice-total-row">
                <Table.Summary.Cell index={0} colSpan={5}>
                  <strong>Line Totals</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5}>
                  <strong className="invoice-total-value">{formatAmount(summaryCurrency, totalTechRate)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} />
                <Table.Summary.Cell index={7} />
                <Table.Summary.Cell index={8} />
                <Table.Summary.Cell index={9}>
                  <strong className="invoice-total-value">{formatJobTotal(summaryCurrency, totalAmount)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </div>
    )
  }

  async function onInvoicePdfChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await handleAttachDocuments({ invoicePdf: file })
  }

  async function onPayinfoPdfChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await handleAttachDocuments({ payinfoPdf: file })
  }

  return (
    <Card className="section-card invoice-detail-card" variant="borderless">
      <div className="invoice-detail-head">
        <div className="invoice-detail-meta">
          <Typography.Text strong>{batch.batch}</Typography.Text>
          <div className="invoice-detail-meta-items">
            {metaItem('Mode', batch.invoiceMode)}
            {metaItem(batch.batchKind === 'sla' ? 'Retainers' : 'Jobs', `${batch.jobs}`)}
            {slaDisplayTotal > 0 ? metaItem('SLA Invoice', formatAmount(batch.currency, slaDisplayTotal)) : null}
            {batch.batchKind === 'jobs' && slaDisplayTotal > 0 ? metaItem('With SLA', formatJobTotal(batch.currency, batch.combinedTotal)) : null}
            {categoryMode && payinfoTotal != null ? metaItem('Payinfo', formatAmount(batch.currency, payinfoTotal)) : null}
            {metaItem('Total', formatJobTotal(batch.currency, displayTotal))}
            {settlementReconciled ? (
              <span
                aria-label="Settlement reconciled"
                style={{
                  alignItems: 'center',
                  background: '#dff4e4',
                  border: '1px solid #b7e2c1',
                  borderRadius: 999,
                  color: '#1f7a38',
                  display: 'inline-flex',
                  height: 22,
                  justifyContent: 'center',
                  width: 22,
                }}
              >
                <CheckOutlined style={{ fontSize: 11 }} />
              </span>
            ) : null}
          </div>
        </div>
        <Space size={8}>
          {categoryMode && obh1JobIds.length > 0 && onBulkMoveObh1ToReg ? (
            <Button onClick={() => onBulkMoveObh1ToReg(obh1JobIds)}>
              Move All OBH1 to REG
            </Button>
          ) : null}
          {showDocuments ? (
            <>
              <Button onClick={() => setActiveView('lines')} type={activeView === 'lines' ? 'primary' : 'default'}>
                Lines
              </Button>
              <Button onClick={() => setActiveView('documents')} type={activeView === 'documents' ? 'primary' : 'default'}>
                Documents
              </Button>
            </>
          ) : null}
          {showSlaToggle ? (
            <Button onClick={onToggleIncludeSla} type={includeSla ? 'primary' : 'default'}>
              View with SLA
            </Button>
          ) : null}
          <Button onClick={() => onExport(batch)}>Export CSV</Button>
        </Space>
      </div>
      {categoryMode && payinfoTotal != null && payinfoDifference != null && !settlementReconciled ? (
        <Alert
          message='Settlement does not reconcile to payinfo total.'
          showIcon
          type='warning'
          description={`Payinfo ${formatAmount(batch.currency, payinfoTotal)} · Settlement ${formatJobTotal(batch.currency, displayTotal)} · Difference ${formatAmount(batch.currency, payinfoDifference)}`}
        />
      ) : null}
      {categoryMode && unreconciledRows.length > 0 ? (
        <Card className="section-card" size="small" variant="borderless">
          <div className="toolbar-row">
            <div>
              <Typography.Text strong>Unreconciled Invoices</Typography.Text>
              <Typography.Text className="page-description">Grouped by invoice and technician to match the vendor PDF weekly structure.</Typography.Text>
            </div>
          </div>
          <ErpDataTable<SettlementReconciliationRow>
            className="nested-table invoice-job-table"
            columnSizing="manual"
            columns={getSettlementReconciliationColumns()}
            dataSource={unreconciledRows}
            expandable={{
              expandedRowKeys: expandedReconciliationId ? [expandedReconciliationId] : [],
              expandedRowRender: (row) => renderCategoryLineTable(
                categoryInvoiceRows.filter((item) => row.jobIds.includes(item.id)),
              ),
              showExpandColumn: false,
            }}
            onRow={(row) => ({
              onClick: () => {
                setExpandedReconciliationId((current) => (current === row.id ? '' : row.id))
              },
            })}
            rowKey="id"
            rowClassName={(row) => (row.id === expandedReconciliationId ? 'selected-row' : '')}
            tableLayout="auto"
          />
        </Card>
      ) : null}
      {activeView === 'documents' ? (
        <div className="invoice-documents-layout">
          <div className="invoice-documents-sidebar">
            <div className="invoice-documents-actions">
              <input accept="application/pdf" hidden onChange={onInvoicePdfChange} ref={invoicePdfInputRef} type="file" />
              <input accept="application/pdf" hidden onChange={onPayinfoPdfChange} ref={payinfoPdfInputRef} type="file" />
              <Button disabled={isUploadingDocuments} onClick={() => invoicePdfInputRef.current?.click()}>
                Add Invoice PDF
              </Button>
              <Button disabled={isUploadingDocuments} onClick={() => payinfoPdfInputRef.current?.click()}>
                Add Payinfo PDF
              </Button>
              {orderedPdfDocuments.length > 1 ? (
                <Button onClick={() => setDocumentViewMode((current) => (current === 'compare' ? 'single' : 'compare'))}>
                  {documentViewMode === 'compare' ? 'Single Preview' : 'Compare Side by Side'}
                </Button>
              ) : null}
            </div>
            {pdfDocuments.length ? (
              <div className="invoice-document-list">
                {pdfDocuments.map((document) => (
                  <button
                    className={`invoice-document-list-item${document.id === selectedDocumentId ? ' is-active' : ''}`}
                    key={document.id}
                    onClick={() => setSelectedDocumentId(document.id)}
                    type="button"
                  >
                    <strong>{documentKindLabel(document.kind)}</strong>
                    <span>{document.fileName}</span>
                    <span>{formatFileSize(document.size)}</span>
                    <span>{new Date(document.uploadedAt).toLocaleString()}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty className="invoice-documents-empty" description="No PDFs attached yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
          <div className="invoice-documents-preview">
            {documentViewMode === 'compare' && orderedPdfDocuments.length > 1 ? (
              <div className="invoice-documents-compare">
                {orderedPdfDocuments.map((document) => (
                  <section className="invoice-documents-compare-card" key={document.id}>
                    <div className="invoice-document-preview-head">
                      <div>
                        <Typography.Text strong>{document.fileName}</Typography.Text>
                        <Typography.Text className="page-description">
                          {documentKindLabel(document.kind)} · {formatFileSize(document.size)}
                        </Typography.Text>
                      </div>
                    </div>
                    {document.storedPath ? (
                      <PdfDocumentPreview storedPath={document.storedPath} />
                    ) : (
                      <div className="invoice-document-preview-empty">Reattach this PDF to preview it.</div>
                    )}
                  </section>
                ))}
              </div>
            ) : selectedDocument ? (
              <>
                <div className="invoice-document-preview-head">
                  <div>
                    <Typography.Text strong>{selectedDocument.fileName}</Typography.Text>
                    <Typography.Text className="page-description">
                      {documentKindLabel(selectedDocument.kind)} · {formatFileSize(selectedDocument.size)}
                    </Typography.Text>
                  </div>
                </div>
                {documentLoading ? (
                  <div className="invoice-document-preview-empty">Loading document...</div>
                ) : documentError ? (
                  <div className="invoice-document-preview-empty">{documentError}</div>
                ) : documentStoredPath ? (
                  <PdfDocumentPreview storedPath={documentStoredPath} />
                ) : (
                  <div className="invoice-document-preview-empty">Select a document to preview it.</div>
                )}
              </>
            ) : (
              <div className="invoice-document-preview-empty">Add a PDF to attach it to this invoice run.</div>
            )}
          </div>
        </div>
      ) : batch.batchKind === 'sla' ? (
        <ErpDataTable<SlaLine>
          className="nested-table invoice-job-table"
          columnSizing="manual"
          columns={getSlaColumns()}
          dataSource={batch.slaLines}
          rowKey={(line) => line.label}
          tableLayout="auto"
          summary={() => (
            <Table.Summary>
              <Table.Summary.Row className="invoice-summary-row invoice-total-row">
                <Table.Summary.Cell index={0} colSpan={2}>
                  <strong>Retainer Total</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2}>
                  <strong className="invoice-total-value">{formatJobTotal(batch.currency, batch.total)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      ) : (
        categoryMode ? (
          <ErpDataTable<CategoryInvoiceGroupRow>
            className="nested-table invoice-job-table"
            columnSizing="manual"
            columns={categoryInvoiceGroupColumns}
            dataSource={categoryInvoiceGroupRows}
            expandable={{
              expandedRowKeys: expandedCategoryInvoiceId ? [expandedCategoryInvoiceId] : [],
              expandedRowRender: (group) => renderCategoryLineTable(group.rows),
              showExpandColumn: false,
            }}
            onRow={(row) => ({ onClick: () => setExpandedCategoryInvoiceId((current) => (current === row.id ? '' : row.id)) })}
            rowKey="id"
            rowClassName={(row) => (row.id === expandedCategoryInvoiceId ? 'selected-row' : '')}
            tableLayout="auto"
            summary={() => (
              <Table.Summary>
                <Table.Summary.Row className="invoice-summary-row invoice-total-row">
                  <Table.Summary.Cell index={0} colSpan={Math.max(categoryInvoiceGroupColumns.length - 1, 1)}>
                    <strong>{includeSla && slaDisplayTotal > 0 ? 'Total with SLA' : 'Invoice Total'}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={Math.max(categoryInvoiceGroupColumns.length - 1, 1)}>
                    <strong className="invoice-total-value">{formatJobTotal(batch.currency, displayTotal)}</strong>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        ) : (
          <ErpDataTable<PricedJob>
            className="nested-table invoice-job-table"
            columnSizing="manual"
            columns={getColumns(categoryMode)}
            dataSource={batch.items}
            expandable={{
              expandedRowKeys: selectedJobId ? [selectedJobId] : [],
              expandedRowRender: (job) => (
                <InvoiceManualOverridePanel customer={customer} job={job} onSaveOverride={onSaveReviewOverride} />
              ),
              showExpandColumn: false,
            }}
            onRow={(job) => ({ onClick: () => setSelectedJobId((current) => (current === job.id ? '' : job.id)) })}
            rowClassName={(job) => (job.id === selectedJobId ? 'selected-row' : '')}
            rowKey="id"
            scroll={{ x: 'max-content' }}
            tableLayout="auto"
            summary={() => (
              <Table.Summary>
                <Table.Summary.Row className="invoice-summary-row invoice-total-row">
                  <Table.Summary.Cell index={0} colSpan={14}>
                    <strong>{includeSla && slaDisplayTotal > 0 ? 'Total with SLA' : 'Invoice Total'}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={14}>
                    <strong className="invoice-total-value">{formatJobTotal(batch.currency, displayTotal)}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={15} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        )
      )}
    </Card>
  )
}
