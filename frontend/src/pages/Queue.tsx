import { useQueue } from '../hooks/useQueue'
import { QueueItem } from '../components/QueueItem'
import { Card } from '../components/Card'
import { StaggeredList, StaggeredItem } from '../components/StaggeredList'

export function QueuePage() {
  const { active, recent } = useQueue()

  return (
    <div className="mx-auto w-full max-w-4xl pt-4 md:pt-6 space-y-6">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50 mb-3">
          Active ({active.length})
        </h2>
        {active.length === 0 ? (
          <Card className="p-6 text-sm text-white/55">Nothing active.</Card>
        ) : (
          <StaggeredList className="flex flex-col gap-2">
            {active.map((j) => (
              <StaggeredItem key={j.id}>
                <QueueItem job={j} />
              </StaggeredItem>
            ))}
          </StaggeredList>
        )}
      </section>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50 mb-3">
          History ({recent.length})
        </h2>
        {recent.length === 0 ? (
          <Card className="p-6 text-sm text-white/55">
            No completed downloads yet.
          </Card>
        ) : (
          <StaggeredList className="flex flex-col gap-2">
            {recent.slice(0, 50).map((j) => (
              <StaggeredItem key={j.id}>
                <QueueItem job={j} />
              </StaggeredItem>
            ))}
          </StaggeredList>
        )}
      </section>
    </div>
  )
}
