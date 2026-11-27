/**
 * A table that fills a Card edge to edge: no inner padding, with the first and
 * last cell padded by the card's own spacing so text lines up with the panel.
 */
export const cardTable =
    "p-0 [&_th:first-child]:pl-(--card-spacing) [&_td:first-child]:pl-(--card-spacing) [&_th:last-child]:pr-(--card-spacing) [&_td:last-child]:pr-(--card-spacing)"
