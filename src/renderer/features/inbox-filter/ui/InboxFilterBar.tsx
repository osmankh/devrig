import { useCallback, useState } from 'react'
import { Search, Filter, X } from 'lucide-react'
import { cn } from '@shared/lib/cn'
import { Badge, Input } from '@shared/ui'
import { useInboxStore } from '@entities/inbox-item'
import type { InboxItemStatus, InboxPriority, InboxItemType } from '@entities/inbox-item'
import { STATUS_OPTIONS, PRIORITY_OPTIONS, TYPE_OPTIONS } from '../model/inbox-filter.types'

function FilterChip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-0.5 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}

export function InboxFilterBar() {
  const filters = useInboxStore((s) => s.filters)
  const setFilters = useInboxStore((s) => s.setFilters)
  const stats = useInboxStore((s) => s.stats)
  const [showFilters, setShowFilters] = useState(false)
  const [searchValue, setSearchValue] = useState(filters.search ?? '')

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setSearchValue(value)
      // Debounced via a timeout would be ideal but keeping it simple
      setFilters({ search: value || undefined })
    },
    [setFilters]
  )

  const clearSearch = useCallback(() => {
    setSearchValue('')
    setFilters({ search: undefined })
  }, [setFilters])

  const toggleStatus = useCallback(
    (status: InboxItemStatus) => {
      const current = filters.status
      if (current === status) {
        setFilters({ status: undefined })
      } else {
        setFilters({ status })
      }
    },
    [filters.status, setFilters]
  )

  const togglePriority = useCallback(
    (priority: InboxPriority) => {
      const current = filters.priority
      if (current === priority) {
        setFilters({ priority: undefined })
      } else {
        setFilters({ priority })
      }
    },
    [filters.priority, setFilters]
  )

  const toggleType = useCallback(
    (type: InboxItemType) => {
      const current = filters.type
      if (current === type) {
        setFilters({ type: undefined })
      } else {
        setFilters({ type })
      }
    },
    [filters.type, setFilters]
  )

  const toggleActionable = useCallback(() => {
    setFilters({ isActionable: filters.isActionable ? undefined : true })
  }, [filters.isActionable, setFilters])

  const hasActiveFilters =
    filters.status !== undefined ||
    filters.priority !== undefined ||
    filters.type !== undefined ||
    filters.isActionable !== undefined

  const clearAllFilters = useCallback(() => {
    setFilters({
      status: undefined,
      priority: undefined,
      type: undefined,
      isActionable: undefined,
      search: undefined
    })
    setSearchValue('')
  }, [setFilters])

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-2">
      {/* Search + filter toggle row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={handleSearch}
            placeholder="Search inbox..."
            className="h-8 pl-8 pr-8 text-sm"
          />
          {searchValue && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex h-8 items-center gap-1 rounded-md border px-2 text-xs transition-colors',
            showFilters || hasActiveFilters
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              !
            </Badge>
          )}
        </button>
        {stats.unreadCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {stats.unreadCount} unread
          </Badge>
        )}
      </div>

      {/* Expandable filter panel */}
      {showFilters && (
        <div className="flex flex-col gap-2 pb-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Status:</span>
            {STATUS_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                active={filters.status === opt.value}
                onClick={() => toggleStatus(opt.value)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Priority:</span>
            {PRIORITY_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                active={filters.priority === opt.value}
                onClick={() => togglePriority(opt.value)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Type:</span>
            {TYPE_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                active={filters.type === opt.value}
                onClick={() => toggleType(opt.value)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <FilterChip
              label="Actionable only"
              active={filters.isActionable === true}
              onClick={toggleActionable}
            />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
